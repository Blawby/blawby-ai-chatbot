/**
 * KV-based counter utilities for rate limiting and quotas
 */

import { Env } from '../types';

/**
 * Increment a daily counter and check if limit is exceeded
 */
export async function incrementDailyCounter(
  env: Env,
  key: string,
  limit: number
): Promise<{ exceeded: boolean; current: number }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const counterKey = `${key}:${today}`;
  
  // Get current count
  const current = await env.CHAT_SESSIONS.get(counterKey);
  const parsedCount = parseInt(current, 10);
  const count = Number.isNaN(parsedCount) ? 0 : parsedCount;
  
  // Check if limit would be exceeded
  if (count >= limit) {
    return { exceeded: true, current: count };
  }
  
  // Increment counter
  const newCount = count + 1;
  await env.CHAT_SESSIONS.put(counterKey, newCount.toString(), {
    expirationTtl: 86400, // 24 hours
  });
  
  return { exceeded: false, current: newCount };
}

/**
 * Increment a per-minute rate limit counter and check if limit is exceeded
 */
export async function incrementRateLimitCounter(
  env: Env,
  key: string,
  limit: number
): Promise<{ exceeded: boolean; current: number }> {
  const now = new Date();
  const minuteKey = `${key}:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  
  // Get current count
  const current = await env.CHAT_SESSIONS.get(minuteKey);
  const parsedCount = parseInt(current, 10);
  const count = Number.isNaN(parsedCount) ? 0 : parsedCount;
  
  // Check if limit would be exceeded
  if (count >= limit) {
    return { exceeded: true, current: count };
  }
  
  // Increment counter
  const newCount = count + 1;
  await env.CHAT_SESSIONS.put(minuteKey, newCount.toString(), {
    expirationTtl: 120, // 2 minutes to ensure it covers the current minute
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
  const value = await env.CHAT_SESSIONS.get(key);
  const parsedValue = parseInt(value, 10);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}
