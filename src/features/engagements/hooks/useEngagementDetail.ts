import { useCallback } from 'preact/hooks';
import { useQuery } from '@/shared/hooks/useQuery';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import { getEngagement } from '../api/engagementsApi';
import type { EngagementDetail } from '../types/engagement';

/**
 * Fetch a single engagement detail keyed by (practiceId, engagementId).
 * Backed by useQuery for in-flight coalescing and the canonical async-state
 * contract. Mutations (send to client, withdraw, etc.) can call `setData`
 * to write the server's response into the cache directly — no extra
 * roundtrip and the UI updates synchronously.
 */
export function useEngagementDetail(practiceId: string | null, engagementId: string) {
  const cacheKey = `engagement:${practiceId ?? ''}:${engagementId}`;
  const query = useQuery<EngagementDetail>({
    key: cacheKey,
    fetcher: (signal) => getEngagement(practiceId!, engagementId, { signal }),
    ttl: policyTtl(cacheKey),
    enabled: Boolean(practiceId && engagementId),
    // Engagement status (sent/accepted/withdrawn) drives action buttons —
    // serving stale could let a user re-trigger a completed action.
    swr: false,
  });

  const setData = useCallback((next: EngagementDetail) => {
    queryCache.set(cacheKey, next, policyTtl(cacheKey));
  }, [cacheKey]);

  return { ...query, setData };
}
