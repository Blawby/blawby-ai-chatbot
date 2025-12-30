/**
 * FileDisplay - Organism Component
 * 
 * Orchestrates file display using atomic components.
 * Handles data transformation and state mapping.
 * This is the main entry point for file display.
 */

import { FileCard, type FileCardStatus } from '../molecules/FileCard';
import { isImageFile } from '@/shared/utils/fileTypeUtils';

export type FileDisplayStatus = 'uploading' | 'completed' | 'preview';

export interface FileDisplayProps {
  file: File | {
    name: string;
    type: string;
    size: number;
    url?: string;
  };
  status: FileDisplayStatus;
  progress?: number;
  onRemove?: () => void;
  className?: string;
}

export const FileDisplay = ({ 
  file, 
  status, 
  progress = 0, 
  onRemove, 
  className 
}: FileDisplayProps) => {
  // Map FileDisplayStatus to FileCardStatus
  const mapToFileCardStatus = (displayStatus: FileDisplayStatus): FileCardStatus => {
    switch (displayStatus) {
      case 'uploading':
        return 'uploading';
      case 'completed':
        return 'completed';
      case 'preview':
        return 'preview';
      default:
        return 'none';
    }
  };

  // Create image URL for images
  const imageUrl = isImageFile(file.type) && 'url' in file && file.url 
    ? file.url 
    : undefined;

  return (
    <FileCard
      fileName={file.name}
      mimeType={file.type}
      status={mapToFileCardStatus(status)}
      progress={progress}
      imageUrl={imageUrl}
      onRemove={onRemove}
      className={className}
    />
  );
};
