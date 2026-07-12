import type { Env } from '../types';
import { parseEnvBool } from '../utils/safeStringUtils.js';
import { incrementRateLimitCounter } from '../lib/kvCounters.js';

export async function rateLimit(env: Env, key: string, limit = 60, windowSec = 60): Promise<boolean> {
  // Guard clause: validate numeric parameters
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    throw new RangeError(`Invalid limit parameter: expected a positive finite number, got ${limit}`);
  }
  
  if (typeof windowSec !== 'number' || !Number.isFinite(windowSec) || windowSec <= 0) {
    throw new RangeError(`Invalid windowSec parameter: expected a positive finite number, got ${windowSec}`);
  }

  // Check if we're in a test environment
  const isTestEnv = env.NODE_ENV === 'test' || parseEnvBool(env.ENV_TEST);

  if (!env.CHAT_COUNTER && !env.CHAT_SESSIONS) {
    if (isTestEnv) return true;
    throw new Error('Rate-limit store is not configured');
  }

  if (windowSec !== 60) {
    throw new RangeError('Only one-minute rate-limit windows are supported');
  }

  const result = await incrementRateLimitCounter(env, `rate-limit:${key}`, limit);
  return !result.exceeded;
}

// Helper to get client identifier for rate limiting
export function getClientId(request: Request): string {
  // Try Cloudflare IP first, then fallback to other headers
  return request.headers.get("cf-connecting-ip") || 
         request.headers.get("x-forwarded-for") || 
         request.headers.get("x-real-ip") || 
         "anonymous";
}
