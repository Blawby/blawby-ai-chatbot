import { useMemo } from 'preact/hooks';

import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { listAllFileIntakes, listAllFileMatters } from '@/features/files/hooks/pagination';

export type OrgFilesScope = 'practice' | 'client';

export interface UseOrgFoldersOptions {
  practiceId: string | null | undefined;
  scope: OrgFilesScope;
  /** Required when scope === 'client'. Filters to matters owned by the viewer
   *  and intakes the viewer submitted. */
  userId?: string | null;
  enabled?: boolean;
}

export interface OrgFolder {
  /** Unique id for keys / selection. */
  id: string;
  kind: 'matter' | 'intake';
  /** UUID of the underlying matter / intake. */
  resourceId: string;
  label: string;
}

export interface UseOrgFoldersResult {
  folders: OrgFolder[];
  matterFolders: OrgFolder[];
  intakeFolders: OrgFolder[];
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

const fetchListings = async (
  practiceId: string,
  signal?: AbortSignal,
): Promise<{ matters: BackendMatter[]; intakes: IntakeListItem[] }> => {
  const [mattersResult, intakesResult] = await Promise.allSettled([
    listAllFileMatters(practiceId, signal),
    listAllFileIntakes(practiceId, signal),
  ]);
  if (mattersResult.status === 'rejected' && intakesResult.status === 'rejected') {
    const reason = mattersResult.reason ?? intakesResult.reason;
    throw reason instanceof Error
      ? reason
      : new Error(typeof reason === 'string' ? reason : 'Failed to load folders.');
  }
  return {
    matters: mattersResult.status === 'fulfilled' ? mattersResult.value : [],
    intakes: intakesResult.status === 'fulfilled' ? intakesResult.value : [],
  };
};

export const useOrgFolders = ({
  practiceId,
  scope,
  userId = null,
  enabled = true,
}: UseOrgFoldersOptions): UseOrgFoldersResult => {
  const cacheKey = `intake:org-folders:${practiceId ?? ''}:${scope}:${userId ?? ''}`;
  const { data, isLoading, error, refetch } = useQuery<{ matters: BackendMatter[]; intakes: IntakeListItem[] }>({
    key: cacheKey,
    enabled: enabled && Boolean(practiceId) && (scope === 'practice' || Boolean(userId)),
    ttl: policyTtl(cacheKey),
    fetcher: (signal) => fetchListings(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      practiceId!,
      signal,
    ),
  });

  const refetchVoid = useMemo(() => async () => { await refetch(); }, [refetch]);

  return useMemo(() => {
    const matters = data?.matters ?? [];
    const intakes = data?.intakes ?? [];
    const filteredMatters = scope === 'client' && userId
      ? matters.filter((matter) => matterMatchesViewer(matter, userId))
      : matters;
    const filteredIntakes = scope === 'client' && userId
      ? intakes.filter((intake) => intakeMatchesViewer(intake, userId))
      : intakes;

    const matterFolders: OrgFolder[] = filteredMatters.map((matter) => ({
      id: `matter:${matter.id}`,
      kind: 'matter',
      resourceId: matter.id,
      label: matter.title?.trim() || 'Untitled matter',
    }));
    const intakeFolders: OrgFolder[] = filteredIntakes.map((intake) => ({
      id: `intake:${intake.uuid}`,
      kind: 'intake',
      resourceId: intake.uuid,
      label: resolveIntakeTitle(intake.metadata),
    }));

    return {
      folders: [...matterFolders, ...intakeFolders],
      matterFolders,
      intakeFolders,
      isLoading,
      error,
      refetch: refetchVoid,
    };
  }, [data, scope, userId, isLoading, error, refetchVoid]);
};
