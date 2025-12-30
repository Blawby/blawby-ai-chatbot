/**
 * File Type Utilities
 * 
 * Pure utility functions for file type detection and configuration.
 * No UI components, just data transformation.
 */

import type { ForwardRefExoticComponent, SVGProps } from 'react';
import { 
  DocumentIcon, 
  PhotoIcon, 
  VideoCameraIcon, 
  MusicalNoteIcon, 
  CodeBracketIcon, 
  ArchiveBoxIcon, 
  TableCellsIcon, 
  DocumentTextIcon 
} from '@heroicons/react/24/outline';

export interface FileTypeConfig {
  color: string;
  icon: ForwardRefExoticComponent<SVGProps<SVGSVGElement> & { title?: string; titleId?: string }>;
  label: string;
}

// Safe extension extraction helper
const getExtension = (name: string): string => {
  const idx = name.lastIndexOf('.');
  return idx !== -1 && idx < name.length - 1 ? name.slice(idx + 1).toLowerCase() : '';
};

export const getFileTypeConfig = (fileName: string, mimeType: string): FileTypeConfig => {
  const extension = getExtension(fileName);
  
  // PDF files
  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return {
      color: 'bg-light-file-type-pdf dark:bg-dark-file-type-pdf',
      icon: DocumentIcon,
      label: 'PDF'
    };
  }
  
  // Image files
  if ((typeof mimeType === 'string' && mimeType.startsWith('image/')) || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'ico', 'heic'].includes(extension)) {
    return {
      color: 'bg-light-file-type-image dark:bg-dark-file-type-image',
      icon: PhotoIcon,
      label: 'Image'
    };
  }
  
  // Video files
  if ((typeof mimeType === 'string' && mimeType.startsWith('video/')) || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(extension)) {
    return {
      color: 'bg-light-file-type-video dark:bg-dark-file-type-video',
      icon: VideoCameraIcon,
      label: 'Video'
    };
  }
  
  // Audio files
  if ((typeof mimeType === 'string' && mimeType.startsWith('audio/')) || ['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(extension)) {
    return {
      color: 'bg-light-file-type-audio dark:bg-dark-file-type-audio',
      icon: MusicalNoteIcon,
      label: 'Audio'
    };
  }
  
  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'].includes(extension)) {
    return {
      color: 'bg-light-file-type-code dark:bg-dark-file-type-code',
      icon: CodeBracketIcon,
      label: 'Code'
    };
  }
  
  // Archive files
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) {
    return {
      color: 'bg-light-file-type-archive dark:bg-dark-file-type-archive',
      icon: ArchiveBoxIcon,
      label: 'Archive'
    };
  }
  
  // Spreadsheet files
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
    return {
      color: 'bg-light-file-type-spreadsheet dark:bg-dark-file-type-spreadsheet',
      icon: TableCellsIcon,
      label: 'Spreadsheet'
    };
  }
  
  // Document files
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension)) {
    return {
      color: 'bg-light-file-type-document dark:bg-dark-file-type-document',
      icon: DocumentTextIcon,
      label: 'Document'
    };
  }
  
  // Default
  return {
    color: 'bg-light-file-type-default dark:bg-dark-file-type-default',
    icon: DocumentIcon,
    label: extension.toUpperCase() || 'FILE'
  };
};

export const isImageFile = (mimeType: string | null | undefined): boolean => {
  return !!mimeType && mimeType.startsWith('image/');
};

/**
 * Get MIME type from file extension
 * Maps common file extensions to their corresponding MIME types
 */
export const getMimeTypeFromFilename = (filename: string): string => {
  const extension = getExtension(filename);
  
  // Image types
  const imageTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'ico': 'image/x-icon',
    'heic': 'image/heic',
    'heif': 'image/heif'
  };
  
  // Video types
  const videoTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'mkv': 'video/x-matroska',
    'flv': 'video/x-flv',
    'wmv': 'video/x-ms-wmv',
    'm4v': 'video/x-m4v'
  };
  
  // Audio types
  const audioTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
    'webm': 'audio/webm'
  };
  
  // Document types
  const documentTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
    'odt': 'application/vnd.oasis.opendocument.text',
    'ods': 'application/vnd.oasis.opendocument.spreadsheet',
    'odp': 'application/vnd.oasis.opendocument.presentation',
    'csv': 'text/csv',
    'tsv': 'text/tab-separated-values'
  };
  
  // Archive types
  const archiveTypes: Record<string, string> = {
    'zip': 'application/zip',
    'rar': 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    'bz2': 'application/x-bzip2'
  };
  
  // Check all type maps
  if (imageTypes[extension]) return imageTypes[extension];
  if (videoTypes[extension]) return videoTypes[extension];
  if (audioTypes[extension]) return audioTypes[extension];
  if (documentTypes[extension]) return documentTypes[extension];
  if (archiveTypes[extension]) return archiveTypes[extension];
  
  // Default fallback
  return 'application/octet-stream';
};
