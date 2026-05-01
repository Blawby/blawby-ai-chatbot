import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import { getPracticeIntake, type PracticeIntakeDetail } from '@/features/intake/api/intakesApi';

/**
 * Fetch a single intake detail keyed by (practiceId, intakeId). Backed by
 * `useQuery` so concurrent mounts coalesce, refetches dedupe, and the
 * canonical async-state contract applies (data | isLoading | isFetching | error).
 */
export function useIntakeDetail(practiceId: string | null, intakeId: string) {
  const cacheKey = `intake:${practiceId ?? ''}:${intakeId}`;
  return useQuery<PracticeIntakeDetail>({
    key: cacheKey,
    fetcher: (signal) => getPracticeIntake(practiceId!, intakeId, { signal }),
    ttl: policyTtl(cacheKey),
    enabled: Boolean(practiceId && intakeId),
  });
}
