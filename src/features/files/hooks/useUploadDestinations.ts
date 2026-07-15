import { useMemo } from 'preact/hooks';

import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';
import {
  listAllClientFileMatters,
  listAllFileIntakes,
  listAllFileMatters,
} from '@/features/files/hooks/pagination';

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

const fetchDestinations = async (
  practiceId: string,
  isClient: boolean,
  signal?: AbortSignal,
): Promise<{ matters: BackendMatter[]; intakes: IntakeListItem[] }> => {
  const [mattersResult, intakesResult] = await Promise.allSettled([
    isClient ? listAllClientFileMatters(practiceId, signal) : listAllFileMatters(practiceId, signal),
    isClient ? Promise.resolve([] as IntakeListItem[]) : listAllFileIntakes(practiceId, signal),
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

const getPracticeCacheKey = (practiceId: string | null | undefined): string => {
  if (practiceId) return practiceId;
  if (practiceId === null) return 'no-practice:null';
  if (typeof practiceId === 'undefined') return 'no-practice:undefined';
  return 'no-practice:empty';
};

export const useUploadDestinations = ({
  practiceId,
  clientUserId = null,
  enabled = true,
}: UseUploadDestinationsOptions): UploadDestinationsResult => {
  const practiceKey = getPracticeCacheKey(practiceId);
  const cacheKey = `intake:upload-destinations:${practiceKey}:${clientUserId ? 'client' : 'practice'}`;
  const { data, isLoading, error, refetch } = useQuery<{ matters: BackendMatter[]; intakes: IntakeListItem[] }>({
    key: cacheKey,
    enabled: enabled && Boolean(practiceId),
    ttl: policyTtl(cacheKey),
    fetcher: (signal) => fetchDestinations(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      practiceId!,
      Boolean(clientUserId),
      signal,
    ),
  });

  const refetchVoid = useMemo(() => async () => { await refetch(); }, [refetch]);

  return useMemo(() => {
    const matters = data?.matters ?? [];
    const intakes = data?.intakes ?? [];
    return {
      matters,
      intakes,
      isLoading,
      error,
      refetch: refetchVoid,
    };
  }, [data, isLoading, error, refetchVoid]);
};
