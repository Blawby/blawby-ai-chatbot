import { Download, ExternalLink } from 'lucide-preact';

import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Fullscreen } from '@/shared/ui/dialog/Fullscreen';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { isImageFile, getFileTypeConfig } from '@/shared/utils/fileTypeUtils';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { triggerDownload, openFile } from '@/shared/utils/fileDownload';
import { folderForFile, type OrgFile } from '@/features/files/utils/fileCategory';

interface FileDetailDrawerProps {
  file: OrgFile | null;
  isOpen: boolean;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
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
  const url = file.publicUrl;
  const isImage = isImageFile(file.mimeType) && url;

  return (
    <div className="space-y-5">
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-surface-panel">
        {isImage ? (
          <img src={url!} alt={file.fileName} className="h-full w-full object-contain" />
        ) : (
          <div className={`flex h-20 w-20 items-center justify-center rounded-2xl ${fileType.color}`}>
            <Icon icon={fileType.icon} className="h-10 w-10 text-input-text" />
          </div>
        )}
      </div>

      <div>
        <h2 className="break-words text-base font-semibold text-input-text">{file.fileName}</h2>
        <p className="mt-1 text-xs text-input-placeholder">{fileType.label} · {formatBytes(file.fileSize)}</p>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-input-placeholder">Source</dt>
          <dd className="text-right text-input-text">{association.kind === 'loose' ? 'Loose file' : association.label}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-input-placeholder">Added</dt>
          <dd className="text-right text-input-text">
            {file.createdAt ? formatRelativeTime(file.createdAt) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-input-placeholder">Type</dt>
          <dd className="text-right text-input-text">{file.mimeType || '—'}</dd>
        </div>
      </dl>
    </div>
  );
};

const Actions = ({ file, onClose }: { file: OrgFile; onClose: () => void }) => {
  if (!file.publicUrl) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={ExternalLink}
        onClick={() => {
          openFile(file.publicUrl as string);
        }}
      >
        Open
      </Button>
      <Button
        variant="primary"
        size="sm"
        icon={Download}
        onClick={() => {
          triggerDownload(file.publicUrl as string, file.fileName);
        }}
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
          <div className="border-t border-line-glass/30 px-4 py-3">
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
