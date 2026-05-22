import { FunctionComponent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { FileText } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useIntakeFiles } from '@/features/intake/hooks/useIntakeFiles';
import type { IntakeFile } from '@/features/intake/api/intakeFilesApi';

import { FilesCollectionPanel } from '@/features/files/components/FilesCollectionPanel';
import type { OrgFile } from '@/features/files/utils/fileCategory';

interface IntakeFilesPanelProps {
  intakeUuid: string;
  canUpload?: boolean;
  canDelete?: boolean;
  files?: IntakeFile[];
  className?: string;
}

const intakeFileToOrgFile = (file: IntakeFile): OrgFile => ({
  id: `intake:${file.intakeUuid}:${file.id}`,
  fileName: file.fileName,
  mimeType: file.mimeType || 'application/octet-stream',
  fileSize: file.fileSize,
  publicUrl: file.publicUrl ?? null,
  uploadId: file.uploadId,
  createdAt: file.createdAt ?? null,
  matterId: null,
  matterTitle: null,
  intakeUuid: file.intakeUuid,
  intakeTitle: null,
  status: file.status === 'verified'
    ? 'completed'
    : file.status === 'pending'
      ? 'processing'
      : file.status === 'rejected'
        ? 'failed'
        : 'none',
});

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
        showSuccess('File uploaded', file.name);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload file.';
        showError('Upload failed', message);
      }
    }
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

  const orgFiles = useMemo(() => files.map(intakeFileToOrgFile), [files]);

  return (
    <section
      className={`rounded-xl border border-card-border bg-surface-card p-4 sm:p-6 ${className ?? ''}`}
    >
      <FilesCollectionPanel
        files={orgFiles}
        canUpload={canUpload}
        uploadingFiles={uploadingFiles}
        onFilesSelected={(selected) => void handleFilesSelected(selected)}
        showEmptyState={false}
        header={(
          <div className="flex min-w-0 items-center gap-2">
            <Icon icon={FileText} className="h-4 w-4 text-input-placeholder" />
            <h3 className="text-sm font-semibold text-input-text">Files</h3>
          </div>
        )}
      />

      {canDelete && orgFiles.length > 0 ? (
        <div className="mt-4 space-y-2 text-xs">
          {files.map((file) => (
            <button
              key={`delete-${file.id}`}
              type="button"
              className="text-input-placeholder hover:text-red-500"
              onClick={() => setPendingDelete(file)}
            >
              Delete {file.fileName}
            </button>
          ))}
        </div>
      ) : null}

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
