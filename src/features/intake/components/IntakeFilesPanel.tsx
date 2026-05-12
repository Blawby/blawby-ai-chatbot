import { FunctionComponent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { FileText } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { UploadSurface, type UploadSurfaceItem } from '@/shared/ui/upload/organisms/UploadSurface';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { uploadDownloadPath } from '@/config/urls';
import { useIntakeFiles, type UploadingIntakeFile } from '@/features/intake/hooks/useIntakeFiles';
import type { IntakeFile } from '@/features/intake/api/intakeFilesApi';

interface IntakeFilesPanelProps {
  intakeUuid: string;
  canUpload?: boolean;
  canDelete?: boolean;
  files?: IntakeFile[];
  className?: string;
}

const fileItemFromIntakeFile = (
  file: IntakeFile,
  onOpen: () => void,
  onDownload: () => void,
  onRemove?: () => void,
): UploadSurfaceItem => ({
  id: file.id,
  fileName: file.fileName,
  mimeType: file.mimeType ?? 'application/octet-stream',
  fileSize: file.fileSize,
  status: 'ready',
  onOpen,
  onDownload,
  onRemove,
});

const fileItemFromUploading = (entry: UploadingIntakeFile): UploadSurfaceItem => ({
  id: entry.id,
  fileName: entry.file.name,
  mimeType: entry.file.type || 'application/octet-stream',
  fileSize: entry.file.size,
  status: 'uploading',
  progress: entry.progress,
});

const openInBrowser = (uploadId: string): void => {
  if (typeof window === 'undefined') return;
  const path = uploadDownloadPath(uploadId);
  window.open(path, '_blank', 'noopener,noreferrer');
};

const downloadAsAnchor = (uploadId: string, fileName: string): void => {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = uploadDownloadPath(uploadId);
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.click();
};

export const IntakeFilesPanel: FunctionComponent<IntakeFilesPanelProps> = ({
  intakeUuid,
  canUpload = true,
  canDelete = false,
  files: filesProp,
  className,
}) => {
  const { showError, showSuccess } = useToastContext();
  const {
    files: ownFiles,
    uploadingFiles,
    uploadFile,
    deleteFile,
  } = useIntakeFiles(intakeUuid);

  const files = filesProp ?? ownFiles;

  const [pendingDelete, setPendingDelete] = useState<IntakeFile | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFilesSelected = async (selected: File[]) => {
    if (!canUpload) return;
    for (const file of selected) {
      try {
        await uploadFile(file);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload file.';
        showError('Upload failed', message);
      }
    }
  };

  const openDeleteDialog = (file: IntakeFile) => {
    setPendingDelete(file);
    setDeleteReason('');
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteReason('');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const trimmed = deleteReason.trim();
    if (!trimmed) {
      showError('Reason required', 'Please provide a reason for deleting this file.');
      return;
    }
    setIsDeleting(true);
    try {
      await deleteFile(pendingDelete.id, trimmed);
      showSuccess('File deleted', `${pendingDelete.fileName} has been removed.`);
      setPendingDelete(null);
      setDeleteReason('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete file.';
      showError('Delete failed', message);
    } finally {
      setIsDeleting(false);
    }
  };

  const items: UploadSurfaceItem[] = useMemo(() => {
    const uploadingItems = uploadingFiles.map(fileItemFromUploading);
    const readyItems = files.map((file) =>
      fileItemFromIntakeFile(
        file,
        () => openInBrowser(file.uploadId),
        () => downloadAsAnchor(file.uploadId, file.fileName),
        canDelete ? () => openDeleteDialog(file) : undefined,
      ),
    );
    return [...uploadingItems, ...readyItems];
  }, [files, uploadingFiles, canDelete]);

  return (
    <section
      className={`rounded-xl border border-card-border bg-surface-card p-4 sm:p-6 ${className ?? ''}`}
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon icon={FileText} className="h-4 w-4 text-input-placeholder" />
        <h3 className="text-sm font-semibold text-input-text">Files</h3>
      </div>
      {canUpload ? (
        <UploadSurface
          onFilesSelected={(selected) => void handleFilesSelected(selected)}
          items={items}
          dropzoneInstructionText="Drag & drop or choose file to upload"
          dropzoneValidationText="Max 50 MB per file"
          dropzoneDisabled={false}
          emptyStateLabel={items.length === 0 ? 'No files uploaded yet' : null}
        />
      ) : items.length === 0 ? (
        <p className="text-sm text-input-placeholder">No files uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-glass/15 bg-surface-utility/35 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-input-text">{item.fileName}</p>
                <p className="text-xs text-input-placeholder">
                  {(item.fileSize / 1024).toFixed(1)} KB
                </p>
              </div>
              <div className="flex items-center gap-2">
                {item.onOpen ? (
                  <Button variant="ghost" size="sm" onClick={item.onOpen}>
                    Open
                  </Button>
                ) : null}
                {item.onDownload ? (
                  <Button variant="ghost" size="sm" onClick={item.onDownload}>
                    Download
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        isOpen={pendingDelete !== null}
        onClose={closeDeleteDialog}
        title="Delete file"
        description={
          pendingDelete
            ? `Provide a reason for deleting "${pendingDelete.fileName}". This will be recorded for audit.`
            : undefined
        }
        disableBackdropClick={isDeleting}
      >
        <DialogBody className="space-y-4">
          <Textarea
            label="Reason"
            value={deleteReason}
            onChange={setDeleteReason}
            rows={3}
            placeholder="Why are you deleting this file?"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={closeDeleteDialog} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isDeleting || deleteReason.trim().length === 0}
            onClick={() => void confirmDelete()}
          >
            {isDeleting ? 'Deleting…' : 'Confirm deletion'}
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
};

export default IntakeFilesPanel;
