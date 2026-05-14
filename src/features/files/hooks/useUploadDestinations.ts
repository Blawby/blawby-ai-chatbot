import { useMemo } from 'preact/hooks';

import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';
import { listAllFileIntakes, listAllFileMatters } from '@/features/files/hooks/pagination';

export interface UseUploadDestinationsOptions {
  practiceId: string | null | undefined;
  /** When non-null, restricts results to matters/intakes belonging to this user. */
  clientUserId?: string | null;
  enabled?: boolean;
}

export interface UploadDestinationsResult {
  matters: BackendMatter[];
  intakes: IntakeListItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const matterMatchesViewer = (matter: BackendMatter, userId: string): boolean => (
  typeof matter.client_id === 'string' && matter.client_id === userId
);

const intakeMatchesViewer = (intake: IntakeListItem, userId: string): boolean => {
  const meta = intake.metadata as Record<string, unknown> | null | undefined;
  return typeof meta?.user_id === 'string' && meta.user_id === userId;
};

const fetchDestinations = async (
  practiceId: string,
  signal?: AbortSignal,
): Promise<{ matters: BackendMatter[]; intakes: IntakeListItem[] }> => {
  const [mattersResult, intakesResult] = await Promise.allSettled([
    listAllFileMatters(practiceId, signal),
    listAllFileIntakes(practiceId, signal),
  ]);
  // If both calls fail, surface an error rather than caching an empty
  // success — otherwise the dropdown silently looks empty for 30s after a
  // transient network/auth blip.
  if (mattersResult.status === 'rejected' && intakesResult.status === 'rejected') {
    const reason = mattersResult.reason ?? intakesResult.reason;
    throw reason instanceof Error
      ? reason
      : new Error(typeof reason === 'string' ? reason : 'Failed to load destinations.');
  }
  return {
    matters: mattersResult.status === 'fulfilled' ? mattersResult.value : [],
    intakes: intakesResult.status === 'fulfilled' ? intakesResult.value : [],
  };
};

export const useUploadDestinations = ({
  practiceId,
  clientUserId = null,
  enabled = true,
}: UseUploadDestinationsOptions): UploadDestinationsResult => {
  const cacheKey = `intake:upload-destinations:${practiceId ?? ''}`;
  const { data, isLoading, error, refetch } = useQuery<{ matters: BackendMatter[]; intakes: IntakeListItem[] }>({
    key: cacheKey,
    enabled: enabled && Boolean(practiceId),
    ttl: policyTtl(cacheKey),
    fetcher: (signal) => fetchDestinations(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      practiceId!,
      signal,
    ),
  });

  const refetchVoid = useMemo(() => async () => { await refetch(); }, [refetch]);

  return useMemo(() => {
    const matters = data?.matters ?? [];
    const intakes = data?.intakes ?? [];
    if (!clientUserId) {
      return { matters, intakes, isLoading, error, refetch: refetchVoid };
    }
    return {
      matters: matters.filter((matter) => matterMatchesViewer(matter, clientUserId)),
      intakes: intakes.filter((intake) => intakeMatchesViewer(intake, clientUserId)),
      isLoading,
      error,
      refetch: refetchVoid,
    };
  }, [data, clientUserId, isLoading, error, refetchVoid]);
};
