import { useMemo } from 'preact/hooks';
import { listPracticeTeam } from '@/shared/lib/apiClient';
import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import type { TeamSummary } from '@/shared/types/team';

const DEFAULT_SUMMARY: TeamSummary = {
  seatsIncluded: 1,
  seatsUsed: 0,
};

type UsePracticeTeamOptions = {
  enabled?: boolean;
};

export const usePracticeTeam = (
  practiceId: string | null | undefined,
  userId: string | null | undefined,
  options: UsePracticeTeamOptions = {}
) => {
  const { enabled = true } = options;
  const resolvedUserId = userId?.trim() || 'anonymous';
  const cacheKey = useMemo(
    () => `practice:team:${resolvedUserId}:${practiceId ?? ''}`,
    [practiceId, resolvedUserId]
  );

  const { data, error, isLoading, refetch } = useQuery({
    key: cacheKey,
    fetcher: (signal) => listPracticeTeam(practiceId!, { signal }),
    ttl: policyTtl(cacheKey),
    enabled: enabled && Boolean(practiceId),
  });

  return {
    members: data?.members ?? [],
    summary: data?.summary ?? DEFAULT_SUMMARY,
    isLoading,
    error,
    refetch,
  };
};
