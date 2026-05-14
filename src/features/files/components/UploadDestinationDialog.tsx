import { useEffect, useMemo, useState } from 'preact/hooks';
import { Briefcase, Inbox } from 'lucide-preact';

import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { UploadSurface, type UploadSurfaceItem } from '@/shared/ui/upload/organisms/UploadSurface';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { uploadFileViaBackend } from '@/shared/lib/uploadsApi';
import { uploadIntakeFile } from '@/features/intake/api/intakeFilesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import {
  DROPZONE_INSTRUCTION_TEXT,
  DROPZONE_VALIDATION_TEXT,
} from '@/features/files/constants';
import { useUploadDestinations } from '@/features/files/hooks/useUploadDestinations';

interface UploadDestinationDialogProps {
  practiceId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
  /** When provided, restricts the destination picker to matters/intakes the
   *  viewer participates in (client scope). */
  clientUserId?: string | null;
}

type Destination =
  | { kind: 'matter'; matterId: string; label: string }
  | { kind: 'intake'; intakeUuid: string; label: string };

type UploadingItem = { id: string; file: File; progress: number };

const makeId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export const UploadDestinationDialog = ({
  practiceId,
  isOpen,
  onClose,
  onUploaded,
  clientUserId = null,
}: UploadDestinationDialogProps) => {
  const { showSuccess, showError } = useToastContext();
  const [destinationValue, setDestinationValue] = useState<string>('');
  const [uploadingFiles, setUploadingFiles] = useState<UploadingItem[]>([]);

  const { matters, intakes, isLoading, error, refetch } = useUploadDestinations({
    practiceId,
    clientUserId,
    enabled: isOpen,
  });

  // Reset selection whenever the dialog reopens so a stale prior pick doesn't
  // bleed into the new session.
  useEffect(() => {
    if (!isOpen) {
      setDestinationValue('');
      setUploadingFiles([]);
    }
  }, [isOpen]);

  const options: ComboboxOption[] = useMemo(() => {
    const matterOptions = matters.map((matter) => ({
      value: `matter:${matter.id}`,
      label: matter.title?.trim() || 'Untitled matter',
      meta: 'Matter',
      icon: <Icon icon={Briefcase} className="h-4 w-4 text-input-placeholder" />,
    }));
    const intakeOptions = intakes.map((intake) => ({
      value: `intake:${intake.uuid}`,
      label: resolveIntakeTitle(intake.metadata),
      meta: 'Intake',
      icon: <Icon icon={Inbox} className="h-4 w-4 text-input-placeholder" />,
    }));
    return [...matterOptions, ...intakeOptions];
  }, [matters, intakes]);

  const destination: Destination | null = useMemo(() => {
    if (!destinationValue) return null;
    if (destinationValue.startsWith('matter:')) {
      const matterId = destinationValue.slice('matter:'.length);
      const matter = matters.find((m) => m.id === matterId);
      if (!matter) return null;
      return { kind: 'matter', matterId, label: matter.title?.trim() || 'Untitled matter' };
    }
    if (destinationValue.startsWith('intake:')) {
      const intakeUuid = destinationValue.slice('intake:'.length);
      const intake = intakes.find((i) => i.uuid === intakeUuid);
      if (!intake) return null;
      return { kind: 'intake', intakeUuid, label: resolveIntakeTitle(intake.metadata) };
    }
    return null;
  }, [destinationValue, matters, intakes]);

  const surfaceItems: UploadSurfaceItem[] = uploadingFiles.map((entry) => ({
    id: entry.id,
    fileName: entry.file.name,
    mimeType: entry.file.type || 'application/octet-stream',
    fileSize: entry.file.size,
    status: 'uploading' as const,
    progress: entry.progress,
  }));

  const handleFilesSelected = async (files: File[]) => {
    if (!destination || files.length === 0) return;
    const uploadResults = await Promise.all(files.map(async (file) => {
      const uploadId = makeId();
      setUploadingFiles((prev) => [...prev, { id: uploadId, file, progress: 0 }]);
      try {
        if (destination.kind === 'matter') {
          await uploadFileViaBackend({
            file,
            uploadContext: 'matter',
            matterId: destination.matterId,
            isPrivileged: true,
            onProgress: (progress) => {
              setUploadingFiles((prev) => prev.map((entry) => (
                entry.id === uploadId
                  ? { ...entry, progress: progress.percentage }
                  : entry
              )));
            },
          });
        } else {
          await uploadIntakeFile({
            intakeUuid: destination.intakeUuid,
            file,
            onProgress: (progress) => {
              setUploadingFiles((prev) => prev.map((entry) => (
                entry.id === uploadId
                  ? { ...entry, progress: progress.percentage }
                  : entry
              )));
            },
          });
        }
        showSuccess('File uploaded', file.name);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        showError('Upload failed', message);
        return false;
      } finally {
        setUploadingFiles((prev) => prev.filter((entry) => entry.id !== uploadId));
      }
    }));
    if (uploadResults.some(Boolean)) {
      onUploaded();
    }
  };

  const handleClose = () => {
    if (uploadingFiles.length > 0) return;
    onClose();
  };

  const placeholder = isLoading
    ? 'Loading destinations…'
    : options.length === 0
      ? 'No matters or intakes found'
      : 'Select a matter or intake';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload file"
      description="Choose a matter or intake to attach this file to. Files always belong to one of those — there's no standalone destination today."
      disableBackdropClick={uploadingFiles.length > 0}
      contentClassName="max-w-lg max-h-[90dvh] min-h-[640px]"
    >
      <DialogBody className="!overflow-visible space-y-4">
        <Combobox
          label="Attach to"
          placeholder={placeholder}
          value={destinationValue}
          onChange={setDestinationValue}
          options={options}
          disabled={isLoading}
        />
        {error ? (
          <div className="status-error flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{error}</span>
            <Button variant="ghost" size="sm" onClick={() => { void refetch(); }}>
              Retry
            </Button>
          </div>
        ) : null}
        {!isLoading && options.length === 0 && !error ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line-glass/20 bg-surface-panel/50 px-3 py-3 text-sm text-input-placeholder">
            <span className="min-w-0 flex-1">
              {clientUserId
                ? "You don't have any matters or intakes yet. Open a conversation with the practice to get started."
                : 'Create a matter or accept an intake first — files always attach to one.'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => { void refetch(); }}>
              Reload
            </Button>
          </div>
        ) : null}
        {destination ? (
          <UploadSurface
            onFilesSelected={(files) => { void handleFilesSelected(files); }}
            items={surfaceItems}
            dropzoneInstructionText={DROPZONE_INSTRUCTION_TEXT}
            dropzoneValidationText={DROPZONE_VALIDATION_TEXT}
            dropzoneDisabled={uploadingFiles.length > 0}
            emptyStateLabel={null}
          />
        ) : options.length > 0 ? (
          <p className="rounded-xl border border-line-glass/20 bg-surface-panel/50 px-3 py-4 text-sm text-input-placeholder">
            Pick a destination above to enable the upload area.
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" onClick={handleClose} disabled={uploadingFiles.length > 0}>
          Done
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

export default UploadDestinationDialog;
