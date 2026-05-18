import { useMemo } from 'preact/hooks';

import { useQuery } from '@/shared/hooks/useQuery';
import { policyTtl } from '@/shared/lib/cachePolicy';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { listAllFileIntakes, listAllFileMatters } from '@/features/files/hooks/pagination';
import { listUploadsByScope } from '@/shared/lib/uploadsApi';
import { listIntakeFiles } from '@/features/intake/api/intakeFilesApi';
import type { OrgFile } from '@/features/files/utils/fileCategory';

export type OrgFilesScope = 'practice' | 'client';

const matterMatchesViewer = (matter: BackendMatter, userId: string): boolean => (
  typeof matter.client_id === 'string' && matter.client_id === userId
);

const intakeMatchesViewer = (intake: IntakeListItem, userId: string): boolean => {
  const meta = intake.metadata as Record<string, unknown> | null | undefined;
  return typeof meta?.user_id === 'string' && meta.user_id === userId;
};

export interface UseOrgFilesOptions {
  practiceId: string | null | undefined;
  scope: OrgFilesScope;
  /** Required when scope === 'client'. */
  userId?: string | null;
  enabled?: boolean;
}

export interface UseOrgFilesResult {
  files: OrgFile[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const collectMatterFiles = async (
  matters: BackendMatter[],
  signal?: AbortSignal,
): Promise<OrgFile[]> => {
  const results = await Promise.allSettled(matters.map(async (matter) => {
    const records = await listUploadsByScope({
      scopeType: 'matter',
      scopeId: matter.id,
      signal,
    });
    const matterTitle = matter.title?.trim() || 'Untitled matter';
    return records
      .filter((record) => record.status === 'verified')
      .map<OrgFile>((record) => ({
        id: `matter:${matter.id}:${record.upload_id}`,
        fileName: record.file_name,
        mimeType: record.mime_type || 'application/octet-stream',
        fileSize: typeof record.file_size === 'number' ? record.file_size : 0,
        publicUrl: record.public_url ?? null,
        uploadId: record.upload_id,
        createdAt: record.created_at ?? null,
        matterId: matter.id,
        matterTitle,
        intakeUuid: null,
        intakeTitle: null,
      }));
  }));
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
};

const collectIntakeFiles = async (
  intakes: IntakeListItem[],
  signal?: AbortSignal,
): Promise<OrgFile[]> => {
  const results = await Promise.allSettled(intakes.map(async (intake) => {
    const files = await listIntakeFiles(intake.uuid, { signal });
    const intakeTitle = resolveIntakeTitle(intake.metadata);
    return files
      .filter((file) => file.status === 'verified')
      .map<OrgFile>((file) => ({
        id: `intake:${intake.uuid}:${file.uploadId}`,
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/octet-stream',
        fileSize: file.fileSize,
        publicUrl: file.publicUrl ?? null,
        uploadId: file.uploadId,
        createdAt: file.createdAt,
        matterId: null,
        matterTitle: null,
        intakeUuid: intake.uuid,
        intakeTitle,
      }));
  }));
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
};

const fetchAllOrgFiles = async (
  practiceId: string,
  scope: OrgFilesScope,
  userId: string | null,
  signal?: AbortSignal,
): Promise<OrgFile[]> => {
  const [mattersResult, intakesResult] = await Promise.allSettled([
    listAllFileMatters(practiceId, signal),
    listAllFileIntakes(practiceId, signal),
  ]);
  if (mattersResult.status === 'rejected' && intakesResult.status === 'rejected') {
    const reason = mattersResult.reason ?? intakesResult.reason;
    throw reason instanceof Error
      ? reason
      : new Error(typeof reason === 'string' ? reason : 'Failed to load files.');
  }
  const matters = mattersResult.status === 'fulfilled' ? mattersResult.value : [];
  const intakes = intakesResult.status === 'fulfilled' ? intakesResult.value : [];

  const visibleMatters = scope === 'client'
    ? userId ? matters.filter((m) => matterMatchesViewer(m, userId)) : []
    : matters;
  const visibleIntakes = scope === 'client'
    ? userId ? intakes.filter((i) => intakeMatchesViewer(i, userId)) : []
    : intakes;

  const [matterFiles, intakeFiles] = await Promise.all([
    collectMatterFiles(visibleMatters, signal),
    collectIntakeFiles(visibleIntakes, signal),
  ]);

  const all = [...matterFiles, ...intakeFiles];
  all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return all;
};

export const useOrgFiles = ({
  practiceId,
  scope,
  userId = null,
  enabled = true,
}: UseOrgFilesOptions): UseOrgFilesResult => {
  const cacheKey = `org:files:${practiceId ?? ''}:${scope}:${userId ?? ''}`;
  const { data, isLoading, error, refetch } = useQuery<OrgFile[]>({
    key: cacheKey,
    enabled: enabled && Boolean(practiceId) && (scope === 'practice' || Boolean(userId)),
    ttl: policyTtl(cacheKey),
    fetcher: (signal) => fetchAllOrgFiles(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      practiceId!,
      scope,
      userId,
      signal,
    ),
  });

  const refetchVoid = useMemo(() => async () => { await refetch(); }, [refetch]);

  return {
    files: data ?? [],
    isLoading,
    error,
    refetch: refetchVoid,
  };
};
