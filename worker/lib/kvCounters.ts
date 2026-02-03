/**
 * KV-based counter utilities for rate limiting and quotas
 */

import { Env } from '../types';

/**
 * Increment a daily counter and check if limit is exceeded
 * Uses Durable Object for atomic operations
 */
export async function incrementDailyCounter(
  env: Env,
  key: string,
  limit: number
): Promise<{ exceeded: boolean; current: number }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const counterKey = `${key}:${today}`;
  
  if (env.CHAT_COUNTER) {
    try {
      const id = env.CHAT_COUNTER.idFromName(counterKey);
      const stub = env.CHAT_COUNTER.get(id);
      // Use 24h TTL (86400 seconds)
      const response = await stub.fetch(`https://counter.internal/increment?limit=${limit}&ttl=86400`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Durable Object increment failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json() as { exceeded: boolean; current: number };
      if (typeof result?.exceeded !== 'boolean' || typeof result?.current !== 'number') {
        throw new Error('Invalid response shape from Durable Object');
      }
      return result;
    } catch (err) {
      console.error(`[kvCounters] Durable Object error for ${counterKey}:`, err);
      // Rethrow as this is a critical failure for atomic limits
      throw new Error(`Failed to increment atomic counter ${counterKey} (limit: ${limit}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  
  // Fallback to non-atomic KV if DO not configured (not recommended for production)
  const current = await env.CHAT_SESSIONS.get(counterKey);
  const parsedCount = parseInt(current || '0', 10);
  const count = Number.isNaN(parsedCount) ? 0 : parsedCount;
  
  if (count >= limit) {
    return { exceeded: true, current: count };
  }
  
  const newCount = count + 1;
  await env.CHAT_SESSIONS.put(counterKey, newCount.toString(), {
    expirationTtl: 86400,
  });
  
  return { exceeded: false, current: newCount };
}

/**
 * Increment a per-minute rate limit counter and check if limit is exceeded
 * Uses Durable Object for atomic operations
 */
export async function incrementRateLimitCounter(
  env: Env,
  key: string,
  limit: number
): Promise<{ exceeded: boolean; current: number }> {
  const now = new Date();
  const minuteKey = `${key}:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  
  if (env.CHAT_COUNTER) {
    try {
      const id = env.CHAT_COUNTER.idFromName(minuteKey);
      const stub = env.CHAT_COUNTER.get(id);
      // Use 2 min TTL (120 seconds) to cover the current minute
      const response = await stub.fetch(`https://counter.internal/increment?limit=${limit}&ttl=120`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Durable Object rate-limit failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json() as { exceeded: boolean; current: number };
      if (typeof result?.exceeded !== 'boolean' || typeof result?.current !== 'number') {
        throw new Error('Invalid response shape from Durable Object');
      }
      return result;
    } catch (err) {
      console.error(`[kvCounters] Durable Object rate-limit error for ${minuteKey}:`, err);
      throw new Error(`Failed to increment rate-limit counter ${minuteKey} (limit: ${limit}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Fallback to non-atomic KV if DO not configured
  const current = await env.CHAT_SESSIONS.get(minuteKey);
  const parsedCount = parseInt(current || '0', 10);
  const count = Number.isNaN(parsedCount) ? 0 : parsedCount;
  
  if (count >= limit) {
    return { exceeded: true, current: count };
  }
  
  const newCount = count + 1;
  await env.CHAT_SESSIONS.put(minuteKey, newCount.toString(), {
    expirationTtl: 120,
  });
  
  return { exceeded: false, current: newCount };
}

/**
 * Get current count for a counter without incrementing
 */
export async function getCounter(
  env: Env,
  key: string
): Promise<number> {
  if (env.CHAT_COUNTER) {
    try {
      const id = env.CHAT_COUNTER.idFromName(key);
      const stub = env.CHAT_COUNTER.get(id);
      const response = await stub.fetch(`https://counter.internal/get`);
      
      if (response.ok) {
        const data = await response.json() as { current: number };
        return data.current || 0;
      }
    } catch (err) {
      console.warn(`[kvCounters] Durable Object get failed for ${key}, falling back to KV:`, err);
    }
  }

  const value = await env.CHAT_SESSIONS.get(key);
  const parsedValue = parseInt(value || '0', 10);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}
