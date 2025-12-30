import { FileAttachment } from '../../../worker/types';

export interface AggregatedMedia {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  timestamp: Date;
  messageIndex: number;
  category: 'image' | 'video' | 'document' | 'audio' | 'other';
}

export interface MediaGroup {
  category: AggregatedMedia['category'];
  files: AggregatedMedia[];
}

/**
 * Extract all media files from conversation messages and organize them by type
 * Similar to Upwork's file aggregation in chat sidebar
 */
export function aggregateMediaFromMessages(messages: Array<{ files?: FileAttachment[] }>): MediaGroup[] {
  const allMedia: AggregatedMedia[] = [];
  
  // Extract files from all messages
  messages.forEach((message, messageIndex) => {
    if (message.files && Array.isArray(message.files)) {
      message.files.forEach((file: FileAttachment, fileIndex: number) => {
        const category = getFileCategory(file.type, file.name);
        const mediaItem: AggregatedMedia = {
          id: `${messageIndex}-${fileIndex}`,
          name: file.name,
          size: file.size,
          type: file.type,
          url: file.url,
          timestamp: new Date(), // In a real app, this would come from message timestamp
          messageIndex,
          category
        };
        allMedia.push(mediaItem);
      });
    }
  });
  
  // Sort by timestamp (newest first)
  allMedia.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  // Group by category
  const grouped = groupByCategory(allMedia);
  
  // Sort groups by priority: images, videos, documents, audio, other
  const categoryOrder: AggregatedMedia['category'][] = ['image', 'video', 'document', 'audio', 'other'];
  return categoryOrder
    .map(category => grouped[category])
    .filter(group => group && group.files.length > 0);
}

/**
 * Determine file category based on MIME type and filename
 */
function getFileCategory(mimeType: string, filename: string): AggregatedMedia['category'] {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  // Images
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) {
    return 'image';
  }
  
  // Videos
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv'].includes(extension)) {
    return 'video';
  }
  
  // Audio
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension)) {
    return 'audio';
  }
  
  // Documents
  if (mimeType.includes('pdf') || 
      mimeType.includes('document') || 
      mimeType.includes('spreadsheet') ||
      ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'].includes(extension)) {
    return 'document';
  }
  
  return 'other';
}

/**
 * Group media files by category
 */
function groupByCategory(media: AggregatedMedia[]): Record<AggregatedMedia['category'], MediaGroup> {
  const groups: Record<AggregatedMedia['category'], MediaGroup> = {
    image: { category: 'image', files: [] },
    video: { category: 'video', files: [] },
    document: { category: 'document', files: [] },
    audio: { category: 'audio', files: [] },
    other: { category: 'other', files: [] }
  };
  
  media.forEach(item => {
    groups[item.category].files.push(item);
  });
  
  return groups;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get appropriate icon for file type
 */
export function getFileIconName(category: AggregatedMedia['category'], filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  switch (category) {
    case 'image':
      return 'PhotoIcon';
    case 'video':
      return 'VideoCameraIcon';
    case 'audio':
      return 'MusicalNoteIcon';
    case 'document':
      if (extension === 'pdf') return 'DocumentTextIcon';
      if (['doc', 'docx'].includes(extension)) return 'DocumentIcon';
      if (['xls', 'xlsx', 'csv'].includes(extension)) return 'TableCellsIcon';
      return 'DocumentIcon';
    default:
      return 'DocumentIcon';
  }
} 