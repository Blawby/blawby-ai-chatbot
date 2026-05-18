import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Folder } from 'lucide-preact';

import { UploadDropzone } from '@/shared/ui/upload/organisms/UploadDropzone';
import { UploadQueueRow } from '@/shared/ui/upload/molecules/UploadQueueRow';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import {
  listUploadsByScope,
  uploadFileViaBackend,
  type BackendUploadRecord,
} from '@/shared/lib/uploadsApi';

import { FilesGrid } from '@/features/files/components/FilesGrid';
import { FilesList } from '@/features/files/components/FilesList';
import { FilesViewToggle, type FilesViewMode } from '@/features/files/components/FilesViewToggle';
import { FileDetailDrawer } from '@/features/files/components/FileDetailDrawer';
import {
  DROPZONE_INSTRUCTION_TEXT,
  DROPZONE_VALIDATION_TEXT,
} from '@/features/files/constants';
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
  const [detailFile, setDetailFile] = useState<OrgFile | null>(null);
  const [viewMode, setViewMode] = useState<FilesViewMode>('grid');
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

  const handleFileClick = (file: OrgFile) => {
    setDetailFile(file);
  };

  const emptyState = (
    <WorkspacePlaceholderState
      icon={Folder}
      title="No files yet"
      description="Drag and drop files into the area above to upload them to this matter."
    />
  );

  return (
    <div className="space-y-4">
      <UploadDropzone
        onFilesSelected={(files) => { void handleUploadBatch(files); }}
        instructionText={DROPZONE_INSTRUCTION_TEXT}
        validationText={DROPZONE_VALIDATION_TEXT}
        disabled={isUploading}
      />

      {uploadingFiles.length > 0 ? (
        <div className="space-y-2">
          {uploadingFiles.map((entry) => (
            <UploadQueueRow
              key={entry.id}
              fileName={entry.file.name}
              mimeType={entry.file.type || 'application/octet-stream'}
              fileSize={entry.file.size}
              status="uploading"
              progress={entry.progress}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="status-error rounded-xl px-3 py-2 text-sm">{error}</div>
      ) : null}

      <div className="flex justify-end">
        <FilesViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {viewMode === 'list' ? (
        <FilesList
          files={orgFiles}
          isLoading={loading && orgFiles.length === 0}
          emptyState={emptyState}
          onFileClick={handleFileClick}
        />
      ) : (
        <FilesGrid
          files={orgFiles}
          isLoading={loading && orgFiles.length === 0}
          emptyState={emptyState}
          onFileClick={handleFileClick}
        />
      )}

      <FileDetailDrawer
        file={detailFile}
        isOpen={detailFile !== null}
        onClose={() => setDetailFile(null)}
      />
    </div>
  );
}
