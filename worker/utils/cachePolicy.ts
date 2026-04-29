/**
 * Worker-side cache TTL policy.
 *
 * Single source of truth for how long edge-cached entries live. Mirrors
 * the frontend `src/shared/lib/cachePolicy.ts` shape so both layers can
 * be reasoned about together.
 *
 * Keys follow `${entity}:${scope}:${id?}` so prefix lookup works cleanly.
 * Add new entries here rather than passing inline ttlMs numbers to
 * `edgeCache.get_or_fetch` / `edgeCache.set`.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const CACHE_POLICY = [
  // Subscription plans / status — read-mostly, mutation invalidates
  { prefix: 'subscriptions:plans:', ttlMs: MINUTE },
  { prefix: 'subscription:status:', ttlMs: 5 * MINUTE },

  // Practice/workspace data — read-mostly, churn on settings updates
  { prefix: 'practice:details:', ttlMs: MINUTE },
  { prefix: 'practice:config:', ttlMs: 5 * MINUTE },
  { prefix: 'practice:', ttlMs: 5 * MINUTE },

  // Aggregated billing summary — short window so usage updates show up
  { prefix: 'billing:summary:', ttlMs: 30 * SECOND },
] as const;

const DEFAULT_TTL_MS = MINUTE;

/** Look up the TTL (in ms) for a given cache key by longest-prefix match. */
export const policyTtlMs = (key: string): number => {
  let best: { prefix: string; ttlMs: number } | undefined;
  for (const entry of CACHE_POLICY) {
    if (key.startsWith(entry.prefix)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best ? best.ttlMs : DEFAULT_TTL_MS;
};

/**
 * KV expiration TTL is in SECONDS, not milliseconds. Convenience wrapper
 * for callers that write to env.CHAT_SESSIONS / other KV namespaces.
 */
export const policyTtlSeconds = (key: string): number =>
  Math.max(1, Math.round(policyTtlMs(key) / SECOND));
