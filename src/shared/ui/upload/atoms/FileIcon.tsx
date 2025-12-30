/**
 * FileIcon - Atom Component
 * 
 * Pure file type icon display. No status, no interactions.
 * Just renders the appropriate icon for a file type.
 */

import { getFileTypeConfig } from '@/shared/utils/fileTypeUtils';
import { cn } from '@/shared/utils/cn';

interface FileIconProps {
  fileName: string;
  mimeType: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const FileIcon = ({ 
  fileName, 
  mimeType, 
  size = 'md',
  className 
}: FileIconProps) => {
  const config = getFileTypeConfig(fileName, mimeType);
  const IconComponent = config.icon;
  
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12', 
    lg: 'w-14 h-14'
  };
  
  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={cn(
      'rounded-lg flex items-center justify-center',
      config.color,
      sizeClasses[size],
      className
    )}>
      <IconComponent className={cn('text-white', iconSizeClasses[size])} />
    </div>
  );
};
