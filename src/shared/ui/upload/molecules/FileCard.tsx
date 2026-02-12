/**
 * FileCard - Molecule Component
 * 
 * Complete file card that combines icon, info, and remove button.
 * This is the main building block for file display.
 */

import { FileIconWithStatus } from './FileIconWithStatus';
import { FileInfo } from './FileInfo';
import { RemoveButton } from '../atoms/RemoveButton';
import { isImageFile } from '@/shared/utils/fileTypeUtils';
import { cn } from '@/shared/utils/cn';

export type FileCardStatus = 'uploading' | 'completed' | 'processing' | 'analyzing' | 'preview' | 'none';

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
  className
}: FileCardProps) => {
  const isImage = isImageFile(mimeType);
  
  // Map FileCardStatus to StatusOverlay status
  const overlayStatus = status === 'preview' ? 'none' : status;
  
  // Show remove button for preview status or when explicitly requested
  const shouldShowRemove = showRemoveButton || status === 'preview';

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
