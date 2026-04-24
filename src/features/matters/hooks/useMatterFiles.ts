import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { uploadFileViaBackend } from '@/shared/lib/uploadsApi';
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
  const [files, setFiles] = useState<MatterFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingMatterFile[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    abortRef.current?.abort();
    if (!practiceId || !matterId) {
      setFiles([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const result = await listMatterFiles(practiceId, matterId, { signal: controller.signal });
      setFiles(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load files.');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [matterId, practiceId]);

  const uploadMatterFile = useCallback(async (file: File): Promise<MatterFile> => {
    if (!practiceId || !matterId) {
      throw new Error('Missing practice or matter ID.');
    }

    const uploadStateId = makeUploadId();
    setError(null);
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
      setFiles((prev) => [linked, ...prev.filter((item) => item.id !== linked.id)]);
      return linked;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload file.';
      setError(message);
      throw err;
    } finally {
      setUploadingFiles((prev) => prev.filter((entry) => entry.id !== uploadStateId));
    }
  }, [matterId, practiceId]);

  useEffect(() => {
    void refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [refetch]);

  return {
    files,
    isLoading,
    error,
    uploadingFiles,
    isUploading: uploadingFiles.length > 0,
    uploadMatterFile,
    refetch,
  };
};

