/**
 * FileInfo - Molecule Component
 * 
 * Displays file name and type information.
 * Pure display component with no interactions.
 */

import { getFileTypeConfig } from '@/shared/utils/fileTypeUtils';
import { isImageFile } from '@/shared/utils/fileTypeUtils';
import { cn } from '@/shared/utils/cn';

interface FileInfoProps {
  fileName: string;
  mimeType: string;
  showType?: boolean;
  className?: string;
}

export const FileInfo = ({ 
  fileName, 
  mimeType, 
  showType = true,
  className 
}: FileInfoProps) => {
  const isImage = isImageFile(mimeType);
  const config = getFileTypeConfig(fileName, mimeType);
  
  // Don't show file info for images (they show thumbnails instead)
  if (isImage) return null;

  return (
    <div className={cn('flex-1 min-w-0', className)}>
      <p className="file-display-name">
        {fileName}
      </p>
      {showType && (
        <p className="file-display-type">
          {config.label}
        </p>
      )}
    </div>
  );
};
