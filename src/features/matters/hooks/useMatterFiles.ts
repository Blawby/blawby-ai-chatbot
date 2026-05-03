import { useCallback, useState } from 'preact/hooks';
import { uploadFileViaBackend } from '@/shared/lib/uploadsApi';
import { useQuery } from '@/shared/hooks/useQuery';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import {
  listMatterFiles,
  linkUploadToMatter,
  type MatterFile,
} from '@/features/matters/services/matterFilesApi';

export type UploadingMatterFile = {
  id: string;
  file: File;
  progress: number;
};

const makeUploadId = (): string => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export const useMatterFiles = (practiceId: string | null, matterId: string | null) => {
  const cacheKey = `matter:files:${practiceId ?? ''}:${matterId ?? ''}`;
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<MatterFile[]>({
    key: cacheKey,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fetcher: (signal) => listMatterFiles(practiceId!, matterId!, { signal }),
    ttl: policyTtl(cacheKey),
    enabled: Boolean(practiceId && matterId),
  });
  const files = data ?? [];

  const [uploadingFiles, setUploadingFiles] = useState<UploadingMatterFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMatterFile = useCallback(async (file: File): Promise<MatterFile> => {
    if (!practiceId || !matterId) {
      throw new Error('Missing practice or matter ID.');
    }

    const uploadStateId = makeUploadId();
    setUploadError(null);
    setUploadingFiles((prev) => [...prev, { id: uploadStateId, file, progress: 0 }]);

    try {
      const uploaded = await uploadFileViaBackend({
        file,
        uploadContext: 'matter',
        matterId,
        onProgress: (progress) => {
          setUploadingFiles((prev) => prev.map((entry) => (
            entry.id === uploadStateId
              ? { ...entry, progress: progress.percentage }
              : entry
          )));
        },
      });

      const linked = await linkUploadToMatter(practiceId, matterId, uploaded.uploadId);
      // Optimistic update of the cached list — prepend the new file so the UI
      // reflects the upload without waiting for a refetch round-trip. Read
      // the current cache directly (rather than the captured `files`) so this
      // callback isn't invalidated on every list update.
      const current = queryCache.get<MatterFile[]>(cacheKey) ?? [];
      const next = [linked, ...current.filter((item) => item.id !== linked.id)];
      queryCache.set(cacheKey, next, policyTtl(cacheKey));
      return linked;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload file.';
      setUploadError(message);
      throw err;
    } finally {
      setUploadingFiles((prev) => prev.filter((entry) => entry.id !== uploadStateId));
    }
  }, [cacheKey, matterId, practiceId]);

  return {
    files,
    isLoading,
    error: error ?? uploadError,
    uploadingFiles,
    isUploading: uploadingFiles.length > 0,
    uploadMatterFile,
    refetch,
  };
};

