import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  listUploadsByScope,
  uploadFileViaBackend,
  type BackendUploadRecord,
} from '@/shared/lib/uploadsApi';

import { FilesCollectionPanel } from '@/features/files/components/FilesCollectionPanel';
import type { OrgFile } from '@/features/files/utils/fileCategory';

interface MatterFilesPanelProps {
  matterId: string;
  matterTitle?: string | null;
  isPrivilegedUploads?: boolean;
}

type UploadingPanelFile = {
  id: string;
  file: File;
  progress: number;
};

const makeUploadId = (): string => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const recordToOrgFile = (record: BackendUploadRecord, matterId: string, matterTitle: string | null): OrgFile => ({
  id: `matter:${matterId}:${record.upload_id}`,
  fileName: record.file_name,
  mimeType: record.mime_type || 'application/octet-stream',
  fileSize: typeof record.file_size === 'number' ? record.file_size : 0,
  publicUrl: record.public_url ?? null,
  uploadId: record.upload_id,
  createdAt: record.created_at ?? null,
  matterId,
  matterTitle,
  intakeUuid: null,
  intakeTitle: null,
});

export function MatterFilesPanel({ matterId, matterTitle = null, isPrivilegedUploads = true }: MatterFilesPanelProps) {
  const [uploads, setUploads] = useState<BackendUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingPanelFile[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const { showSuccess, showError } = useToastContext();
  const isUploading = uploadingFiles.length > 0;

  const fetchUploads = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    listUploadsByScope({ scopeType: 'matter', scopeId: matterId, signal: controller.signal })
      .then((records) => {
        setUploads(records.filter((record) => record.status === 'verified'));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load files.');
        setLoading(false);
      });
  }, [matterId]);

  const handleUploadBatch = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);

    for (const file of files) {
      const uploadId = makeUploadId();
      setUploadingFiles((prev) => [...prev, { id: uploadId, file, progress: 0 }]);

      try {
        await uploadFileViaBackend({
          file,
          scopeType: 'matter',
          scopeId: matterId,
          isPrivileged: isPrivilegedUploads,
          onProgress: (progress) => {
            setUploadingFiles((prev) => prev.map((entry) => (
              entry.id === uploadId
                ? { ...entry, progress: progress.percentage }
                : entry
            )));
          },
        });
        showSuccess('File uploaded', file.name);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        setError(message);
        showError('Upload failed', message);
      } finally {
        setUploadingFiles((prev) => prev.filter((entry) => entry.id !== uploadId));
      }
    }

    fetchUploads();
  }, [fetchUploads, isPrivilegedUploads, matterId, showError, showSuccess]);

  useEffect(() => {
    fetchUploads();
    return () => { abortRef.current?.abort(); };
  }, [fetchUploads]);

  const orgFiles = uploads.map((record) => recordToOrgFile(record, matterId, matterTitle));

  return (
    <div className="space-y-4">
      <FilesCollectionPanel
        files={orgFiles}
        isLoading={loading && orgFiles.length === 0}
        canUpload
        uploadDisabled={isUploading}
        uploadingFiles={uploadingFiles}
        onFilesSelected={(files) => { void handleUploadBatch(files); }}
        showEmptyState={false}
      />

      {error ? (
        <div className="status-error rounded-r-md px-3 py-2 text-sm">{error}</div>
      ) : null}
    </div>
  );
}
