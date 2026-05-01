/**
 * Frontend cache TTL policy.
 *
 * Single source of truth for how long each kind of cached data lives.
 * Keys follow the convention `${entity}:${scope}:${id?}` so prefix lookup
 * works cleanly. Add new entries here rather than passing inline TTL
 * numbers to `queryCache.coalesceGet`.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const CACHE_POLICY = [
  // Auth/session — short, churns frequently
  { prefix: 'auth:', ttl: 30 * SECOND },
  { prefix: 'preferences:', ttl: MINUTE },

  // Practice data — read-mostly, mutation invalidates
  { prefix: 'practice:public:', ttl: 5 * MINUTE },
  { prefix: 'practice:details:', ttl: MINUTE },
  { prefix: 'practice:team:', ttl: 30 * SECOND },
  { prefix: 'practice:participants:', ttl: 5 * MINUTE },
  { prefix: 'practice:', ttl: MINUTE },
  { prefix: 'practices:', ttl: MINUTE },

  // Lists that change with user actions
  { prefix: 'matters:', ttl: MINUTE },
  { prefix: 'clients:', ttl: MINUTE },
  { prefix: 'invoices:', ttl: 30 * SECOND },
  { prefix: 'activity:', ttl: 30 * SECOND },
  { prefix: 'billing:matter:', ttl: 30 * SECOND },
  { prefix: 'matter:files:', ttl: 30 * SECOND },
  { prefix: 'engagement:', ttl: 30 * SECOND },
  { prefix: 'invoice:practice:', ttl: 30 * SECOND },
  { prefix: 'invoice:client:', ttl: 30 * SECOND },
  { prefix: 'intake:', ttl: 30 * SECOND },

  // Onboarding/setup flows
  { prefix: 'onboarding:', ttl: MINUTE },
] as const;

const DEFAULT_TTL = MINUTE;

/** Look up the TTL for a given cache key by longest-prefix match. */
export const policyTtl = (key: string): number => {
  let best: { prefix: string; ttl: number } | undefined;
  for (const entry of CACHE_POLICY) {
    if (key.startsWith(entry.prefix)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best ? best.ttl : DEFAULT_TTL;
};
