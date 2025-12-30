/**
 * FileUploadStatus - Molecule Component
 * 
 * Wrapper around unified FileDisplay component for uploading files.
 * Maintains backward compatibility while using consistent styling.
 */

import { useState, useEffect } from 'preact/hooks';
import { FileDisplay, type FileDisplayStatus } from '../organisms/FileDisplay';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';

interface FileUploadStatusProps {
  file: UploadingFile;
  onCancel?: () => void;
  className?: string;
}

export const FileUploadStatus = ({ file, onCancel, className }: FileUploadStatusProps) => {
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);

  // Map UploadingFile status to FileDisplay status
  const getDisplayStatus = (): FileDisplayStatus => {
    switch (file.status) {
      case 'uploading':
        return 'uploading';
      case 'completed':
        return 'completed';
      default:
        return 'uploading'; // For uploaded, processing, analyzing, failed
    }
  };

  // Manage object URL lifecycle
  useEffect(() => {
    // Revoke previous URL if it exists
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    // Create new URL for image files
    let createdUrl: string | undefined;
    if (file.file.type.startsWith('image/')) {
      createdUrl = URL.createObjectURL(file.file);
      setObjectUrl(createdUrl);
    } else {
      setObjectUrl(undefined);
    }

    // Cleanup function to revoke URL on unmount or file change
    return () => {
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [file.file, objectUrl]); // Re-run when file changes

  // Create file object with URL for images
  const fileWithUrl = {
    name: file.file.name,
    type: file.file.type,
    size: file.file.size,
    url: objectUrl
  };

  return (
    <FileDisplay
      file={fileWithUrl}
      status={getDisplayStatus()}
      progress={file.progress}
      onRemove={onCancel}
      className={className}
    />
  );
};