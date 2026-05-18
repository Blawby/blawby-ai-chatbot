import { useCallback, useState } from 'preact/hooks';

import { useQuery } from '@/shared/hooks/useQuery';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import {
  deleteIntakeFile as deleteIntakeFileApi,
  listIntakeFiles,
  uploadIntakeFile,
  type IntakeFile,
} from '@/features/intake/api/intakeFilesApi';

export type UploadingIntakeFile = {
  id: string;
  file: File;
  progress: number;
};

const makeUploadId = (): string => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export const intakeFilesCacheKey = (intakeUuid: string | null | undefined): string =>
  `intake:files:${intakeUuid ?? ''}`;

export const useIntakeFiles = (intakeUuid: string | null | undefined) => {
  const cacheKey = intakeFilesCacheKey(intakeUuid);
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<IntakeFile[]>({
    key: cacheKey,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fetcher: (signal) => listIntakeFiles(intakeUuid!, { signal }),
    ttl: policyTtl(cacheKey),
    enabled: Boolean(intakeUuid),
  });

  const allFiles = data ?? [];
  const files = allFiles.filter((file) => file.status === 'verified');

  const [uploadingFiles, setUploadingFiles] = useState<UploadingIntakeFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<IntakeFile> => {
    if (!intakeUuid) {
      throw new Error('Missing intake UUID.');
    }

    const uploadStateId = makeUploadId();
    setUploadError(null);
    setUploadingFiles((prev) => [...prev, { id: uploadStateId, file, progress: 0 }]);

    try {
      const uploaded = await uploadIntakeFile({
        intakeUuid,
        file,
        onProgress: (progress) => {
          setUploadingFiles((prev) => prev.map((entry) => (
            entry.id === uploadStateId
              ? { ...entry, progress: progress.percentage }
              : entry
          )));
        },
      });

      const current = queryCache.get<IntakeFile[]>(cacheKey) ?? [];
      const next = [uploaded, ...current.filter((item) => item.id !== uploaded.id)];
      queryCache.set(cacheKey, next, policyTtl(cacheKey));
      return uploaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload file.';
      setUploadError(message);
      throw err;
    } finally {
      setUploadingFiles((prev) => prev.filter((entry) => entry.id !== uploadStateId));
    }
  }, [cacheKey, intakeUuid]);

  const deleteFile = useCallback(async (fileId: string, reason: string): Promise<void> => {
    if (!intakeUuid) {
      throw new Error('Missing intake UUID.');
    }
    await deleteIntakeFileApi({ intakeUuid, fileId, reason });
    const current = queryCache.get<IntakeFile[]>(cacheKey) ?? [];
    const next = current.filter((item) => item.id !== fileId);
    queryCache.set(cacheKey, next, policyTtl(cacheKey));
  }, [cacheKey, intakeUuid]);

  return {
    files,
    allFiles,
    isLoading,
    error: error ?? uploadError,
    uploadingFiles,
    isUploading: uploadingFiles.length > 0,
    uploadFile,
    deleteFile,
    refetch,
  };
};
