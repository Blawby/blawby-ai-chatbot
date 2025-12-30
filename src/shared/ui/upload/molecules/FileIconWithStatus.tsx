/**
 * FileIconWithStatus - Molecule Component
 * 
 * Combines FileIcon with StatusOverlay and ProgressRing.
 * Handles the complex logic of showing file icons with status indicators.
 */

import { useState, useEffect } from 'preact/hooks';
import { FileIcon } from '../atoms/FileIcon';
import { StatusOverlay, type StatusType } from '../atoms/StatusOverlay';
import { ProgressRing } from '../atoms/ProgressRing';
import { isImageFile } from '@/shared/utils/fileTypeUtils';
import { cn } from '@/shared/utils/cn';

interface FileIconWithStatusProps {
  fileName: string;
  mimeType: string;
  status: StatusType;
  progress?: number;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const FileIconWithStatus = ({
  fileName,
  mimeType,
  status,
  progress = 0,
  imageUrl,
  size = 'md',
  className
}: FileIconWithStatusProps) => {
  const isImage = isImageFile(mimeType);
  const [imageError, setImageError] = useState(false);
  
  // Reset imageError when imageUrl changes
  useEffect(() => {
    setImageError(false);
  }, [imageUrl]);
  
  // For images, show thumbnail with overlay - no padding, fills parent container
  if (isImage && imageUrl && !imageError) {
    return (
      <div className={cn('relative w-full h-full overflow-hidden', className)}>
        <img 
          src={imageUrl} 
          alt={`Preview of ${fileName}`} 
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
        
        {/* Status overlay */}
        <StatusOverlay status={status} size={size} />
        
        {/* Progress ring for uploading */}
        {status === 'uploading' && (
          <ProgressRing progress={progress} size={size} />
        )}
      </div>
    );
  }
  
  // For non-images, show icon with status
  return (
    <div className={cn('relative flex-shrink-0', className)}>
      <FileIcon fileName={fileName} mimeType={mimeType} size={size} />
      <StatusOverlay status={status} size={size} />
    </div>
  );
};
