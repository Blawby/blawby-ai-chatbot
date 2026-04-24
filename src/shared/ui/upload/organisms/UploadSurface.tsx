import { UploadDropzone } from './UploadDropzone';
import { UploadQueueRow, type UploadQueueRowStatus } from '@/shared/ui/upload/molecules/UploadQueueRow';

export interface UploadSurfaceItem {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: UploadQueueRowStatus;
  progress?: number;
  onOpen?: () => void;
  onDownload?: () => void;
  onRemove?: () => void;
}

interface UploadSurfaceProps {
  onFilesSelected: (files: File[]) => void;
  items: UploadSurfaceItem[];
  dropzoneLabel?: string;
  dropzoneAccept?: string;
  dropzoneDisabled?: boolean;
  emptyStateLabel?: string | null;
  className?: string;
}

export const UploadSurface = ({
  onFilesSelected,
  items,
  dropzoneLabel = 'Upload files',
  dropzoneAccept,
  dropzoneDisabled = false,
  emptyStateLabel = 'No files',
  className,
}: UploadSurfaceProps) => {
  return (
    <div className={className}>
      <UploadDropzone
        onFilesSelected={onFilesSelected}
        accept={dropzoneAccept}
        disabled={dropzoneDisabled}
        label={dropzoneLabel}
      />

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <UploadQueueRow
              key={item.id}
              fileName={item.fileName}
              mimeType={item.mimeType}
              fileSize={item.fileSize}
              status={item.status}
              progress={item.progress}
              onOpen={item.onOpen}
              onDownload={item.onDownload}
              onRemove={item.onRemove}
            />
          ))}
        </div>
      ) : emptyStateLabel ? (
        <div className="mt-3 rounded-xl border border-line-glass/15 px-3 py-4 text-center text-sm text-input-placeholder">
          {emptyStateLabel}
        </div>
      ) : null}
    </div>
  );
};

