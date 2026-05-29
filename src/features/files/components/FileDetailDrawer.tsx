import { useState } from 'preact/hooks';
import { Download, ExternalLink } from 'lucide-preact';

import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Fullscreen } from '@/shared/ui/dialog/Fullscreen';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { isImageFile, getFileTypeConfig } from '@/shared/utils/fileTypeUtils';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { triggerDownload, openFile } from '@/shared/utils/fileDownload';
import { folderForFile, type OrgFile } from '@/features/files/utils/fileCategory';
import {
  fetchUploadDownloadUrl,
  useUploadPreviewUrl,
} from '@/features/files/hooks/useUploadPreviewUrl';

interface FileDetailDrawerProps {
  file: OrgFile | null;
  isOpen: boolean;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

const FileDetailContent = ({ file }: { file: OrgFile }) => {
  const fileType = getFileTypeConfig(file.fileName, file.mimeType);
  const association = folderForFile(file);
  const isImage = isImageFile(file.mimeType);
  const { url: previewUrl, isLoading: previewLoading } = useUploadPreviewUrl(
    file.uploadId,
    file.publicUrl,
    isImage,
  );

  return (
    <div className="space-y-5">
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-surface-panel">
        {isImage && previewUrl ? (
          <img src={previewUrl} alt={file.fileName} className="h-full w-full object-contain" />
        ) : isImage && previewLoading ? (
          <div className="h-full w-full animate-pulse bg-surface-panel" />
        ) : (
          <div className={`flex h-20 w-20 items-center justify-center rounded-2xl ${fileType.color}`}>
            <Icon icon={fileType.icon} className="h-10 w-10 text-ink" />
          </div>
        )}
      </div>

      <div>
        <h2 className="break-words text-base font-semibold text-ink">{file.fileName}</h2>
        <p className="mt-1 text-xs text-dim-2">{fileType.label} · {formatBytes(file.fileSize)}</p>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-dim-2">Source</dt>
          <dd className="text-right text-ink">{association.kind === 'loose' ? 'Loose file' : association.label}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-dim-2">Added</dt>
          <dd className="text-right text-ink">
            {file.createdAt ? formatRelativeTime(file.createdAt) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-dim-2">Type</dt>
          <dd className="text-right text-ink">{file.mimeType || '—'}</dd>
        </div>
      </dl>
    </div>
  );
};

const Actions = ({ file, onClose }: { file: OrgFile; onClose: () => void }) => {
  const { showError } = useToastContext();
  const [busy, setBusy] = useState(false);

  const run = async (kind: 'open' | 'download') => {
    if (busy) return;
    setBusy(true);
    try {
      const url = file.publicUrl ?? await fetchUploadDownloadUrl(file.uploadId);
      if (kind === 'open') {
        openFile(url);
      } else {
        triggerDownload(url, file.fileName);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resolve download URL.';
      showError('Could not open file', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={ExternalLink}
        disabled={busy}
        onClick={() => { void run('open'); }}
      >
        Open
      </Button>
      <Button
        variant="primary"
        size="sm"
        icon={Download}
        disabled={busy}
        onClick={() => { void run('download'); }}
      >
        Download
      </Button>
      <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
    </div>
  );
};

export const FileDetailDrawer = ({ file, isOpen, onClose }: FileDetailDrawerProps) => {
  const isMobile = useMobileDetection();
  if (!file) return null;

  if (isMobile) {
    return (
      <Fullscreen isOpen={isOpen} onClose={onClose} ariaLabel={`File ${file.fileName}`}>
        <div className="flex h-full flex-col bg-surface-workspace">
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <FileDetailContent file={file} />
          </div>
          <div className="border-t border-line-subtle px-4 py-3">
            <Actions file={file} onClose={onClose} />
          </div>
        </div>
      </Fullscreen>
    );
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="File details">
      <DialogBody>
        <FileDetailContent file={file} />
      </DialogBody>
      <DialogFooter>
        <Actions file={file} onClose={onClose} />
      </DialogFooter>
    </Dialog>
  );
};

export default FileDetailDrawer;
