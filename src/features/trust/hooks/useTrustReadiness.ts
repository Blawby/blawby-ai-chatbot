import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import {
  trustReadinessApi,
  type TrustReadiness,
} from '@/features/trust/services/trustReadinessApi';

export const trustReadinessCacheKey = (practiceId: string): string => `trust:readiness:${practiceId}`;

export const useTrustReadiness = (practiceId: string) => {
  const key = trustReadinessCacheKey(practiceId);
  const query = useQuery<TrustReadiness>({
    key,
    fetcher: (signal) => trustReadinessApi.getReadiness(practiceId, signal),
    ttl: policyTtl(key),
    enabled: Boolean(practiceId),
    swr: false,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
