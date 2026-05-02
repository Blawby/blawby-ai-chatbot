import { Download, ExternalLink, X } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { FileIcon } from '@/shared/ui/upload/atoms/FileIcon';
import { formatFileSize } from '@/shared/utils/mediaAggregation';

export type UploadQueueRowStatus = 'uploading' | 'ready';

interface UploadQueueRowProps {
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: UploadQueueRowStatus;
  progress?: number;
  onOpen?: () => void;
  onDownload?: () => void;
  onRemove?: () => void;
}

const clampProgress = (value: number): number => Math.min(100, Math.max(0, value));

export const UploadQueueRow = ({
  fileName,
  mimeType,
  fileSize,
  status,
  progress = 0,
  onOpen,
  onDownload,
  onRemove,
}: UploadQueueRowProps) => {
  const resolvedProgress = clampProgress(progress);

  return (
    <div className="rounded-xl border border-line-glass/15 bg-surface-utility/35 px-3 py-2">
      <div className="flex items-start gap-3">
        <FileIcon fileName={fileName} mimeType={mimeType} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-input-text">{fileName}</p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-input-placeholder">
            <span>{formatFileSize(fileSize)}</span>
            {status === 'uploading' ? (
              <>
                <span aria-hidden="true">•</span>
                <span>{resolvedProgress}%</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {status === 'ready' && onOpen ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onOpen}
              aria-label={`Open ${fileName}`}
              icon={ExternalLink}
              iconClassName="h-3.5 w-3.5"
            />
          ) : null}
          {status === 'ready' && onDownload ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onDownload}
              aria-label={`Download ${fileName}`}
              icon={Download}
              iconClassName="h-3.5 w-3.5"
            />
          ) : null}
          {onRemove ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onRemove}
              aria-label={`Remove ${fileName}`}
              icon={X}
              iconClassName="h-3.5 w-3.5"
            />
          ) : null}
        </div>
      </div>
      {status === 'uploading' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-glass/20">
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-200"
            style={{ width: `${resolvedProgress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
};

