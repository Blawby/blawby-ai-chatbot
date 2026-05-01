import { computed } from 'nanostores';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import { queryCache } from '@/shared/lib/queryCache';

export type PracticeDetailsMap = Record<string, PracticeDetails | null | undefined>;

const KEY_PREFIX = 'practice:details:';
const detailsKey = (practiceId: string) => `${KEY_PREFIX}${practiceId}`;

/**
 * Reactive map of practiceId → PracticeDetails, derived from `queryCache`.
 *
 * Consumers `useStore(practiceDetailsStore)` to subscribe; behind the scenes
 * we filter the global queryCache for entries under `practice:details:` and
 * strip the prefix so the shape matches the legacy nanostore atom.
 *
 * Writes via `setPracticeDetailsEntry` / `clearPracticeDetailsEntry` /
 * `resetPracticeDetailsStore` go through queryCache.set / queryCache.invalidate
 * so the rest of the app (and `useQuery` consumers of the same key) stay in
 * sync.
 */
export const practiceDetailsStore = computed(queryCache.getStore(), (snapshot) => {
  const map: PracticeDetailsMap = {};
  for (const [key, entry] of Object.entries(snapshot)) {
    if (key.startsWith(KEY_PREFIX)) {
      map[key.slice(KEY_PREFIX.length)] = entry.data as PracticeDetails | null;
    }
  }
  return map;
});

export const setPracticeDetailsEntry = (practiceId: string, details: PracticeDetails | null) => {
  if (!practiceId) return;
  // TTL is governed by `policyTtl('practice:details:')` (cachePolicy.ts).
  // Pass an oversized TTL so the entry survives the policy default. Callers
  // mutate explicitly via setPracticeDetailsEntry/clear; this is not a
  // request-response cache.
  queryCache.set(detailsKey(practiceId), details, Number.MAX_SAFE_INTEGER);
};

export const clearPracticeDetailsEntry = (practiceId: string) => {
  if (!practiceId) return;
  queryCache.invalidate(detailsKey(practiceId));
};

export const resetPracticeDetailsStore = () => {
  queryCache.invalidate(KEY_PREFIX, /* prefix */ true);
};
