/**
 * FileCard - Molecule Component
 *
 * Complete file card that combines icon, info, and remove button.
 * This is the main building block for file display.
 *
 * Variants:
 *   'inline' (default) — compact form used by the chat composer / queue rows.
 *   'tile' — larger card surface for grid views (Files page, matter Files tab).
 */

import { FileIconWithStatus } from './FileIconWithStatus';
import { FileInfo } from './FileInfo';
import { RemoveButton } from '../atoms/RemoveButton';
import { isImageFile, getFileTypeConfig } from '@/shared/utils/fileTypeUtils';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export type FileCardStatus = 'uploading' | 'completed' | 'processing' | 'analyzing' | 'preview' | 'none';
export type FileCardVariant = 'inline' | 'tile';

interface FileCardProps {
  fileName: string;
  mimeType: string;
  status: FileCardStatus;
  progress?: number;
  imageUrl?: string;
  onRemove?: () => void;
  showRemoveButton?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: FileCardVariant;
  /** Tile-only: optional caption beneath the file name (e.g. matter title). */
  associationLabel?: string;
  /** Tile-only: small trailing label (e.g. "2 days ago"). */
  timestampLabel?: string;
  /** Tile-only: click anywhere on the tile (preview, open details). */
  onClick?: () => void;
}

export const FileCard = ({
  fileName,
  mimeType,
  status,
  progress = 0,
  imageUrl,
  onRemove,
  showRemoveButton = false,
  size = 'md',
  className,
  variant = 'inline',
  associationLabel,
  timestampLabel,
  onClick,
}: FileCardProps) => {
  const isImage = isImageFile(mimeType);

  // Map FileCardStatus to StatusOverlay status
  const overlayStatus = status === 'preview' ? 'none' : status;

  // Show remove button for preview status or when explicitly requested
  const shouldShowRemove = showRemoveButton || status === 'preview';

  if (variant === 'tile') {
    const fileType = getFileTypeConfig(fileName, mimeType);
    const tileClassName = cn(
      'group relative flex w-full flex-col overflow-hidden rounded-2xl border border-line-glass/30 bg-surface-card text-left transition-all',
      onClick ? 'cursor-pointer hover:border-line-glass/60 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent-500' : '',
      className
    );
    const renderTileContent = (includeRemove: boolean) => (
      <>
        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-surface-panel">
          {isImage && imageUrl ? (
            <img
              src={imageUrl}
              alt={fileName}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', fileType.color)}>
              <Icon icon={fileType.icon} className="h-7 w-7 text-input-text" />
            </div>
          )}
          {includeRemove && shouldShowRemove && onRemove ? (
            <div className="absolute right-2 top-2 z-10">
              <RemoveButton onClick={onRemove} size="sm" />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5 p-3">
          <p className="truncate text-sm font-medium text-input-text" title={fileName}>{fileName}</p>
          {associationLabel ? (
            <p className="truncate text-xs text-input-placeholder" title={associationLabel}>{associationLabel}</p>
          ) : null}
          {timestampLabel ? (
            <p className="text-[11px] uppercase tracking-wide text-input-placeholder">{timestampLabel}</p>
          ) : null}
        </div>
      </>
    );

    if (onClick) {
      return (
        <div className="relative">
          <button
            type="button"
            className={tileClassName}
            onClick={onClick}
          >
            {renderTileContent(false)}
          </button>
          {shouldShowRemove && onRemove ? (
            <div className="absolute right-2 top-2 z-10">
              <RemoveButton onClick={onRemove} size="sm" />
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className={tileClassName}>
        {renderTileContent(true)}
      </div>
    );
  }

  // For images, use a special layout without padding - match file card height
  if (isImage) {
    return (
      <div className={cn(
        'relative rounded-2xl overflow-hidden flex-shrink-0',
        'glass-panel transition-all duration-200',
        // Make images square, matching the height of file cards
        size === 'sm' ? 'w-14 h-14' : size === 'md' ? 'w-16 h-16' : 'w-20 h-20',
        className
      )}>
        <FileIconWithStatus
          fileName={fileName}
          mimeType={mimeType}
          status={overlayStatus}
          progress={progress}
          imageUrl={imageUrl}
          size={size}
        />

        {/* Remove button - positioned as overlay on top-right */}
        {shouldShowRemove && onRemove && (
          <div className="absolute top-1 right-1 z-50">
            <RemoveButton
              onClick={onRemove}
              size="sm"
            />
          </div>
        )}
      </div>
    );
  }

  // For non-images, use the standard file-display layout
  return (
    <div className={cn('file-display relative', className)}>
      {/* File icon with status */}
      <div className="relative">
        <FileIconWithStatus
          fileName={fileName}
          mimeType={mimeType}
          status={overlayStatus}
          progress={progress}
          imageUrl={imageUrl}
          size={size}
        />
      </div>

      {/* File info - only show for non-images */}
      <FileInfo
        fileName={fileName}
        mimeType={mimeType}
        showType={!isImage}
      />

      {/* Remove button - positioned as overlay on top-right of entire file card */}
      {shouldShowRemove && onRemove && (
        <div className="absolute top-1 right-1 z-50">
          <RemoveButton
            onClick={onRemove}
            size="sm"
          />
        </div>
      )}
    </div>
  );
};
