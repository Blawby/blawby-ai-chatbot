import { uploadWithProgress } from '@/shared/services/upload/UploadTransport';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Upload a practice logo file.
 * 
 * The worker returns an absolute public URL (e.g., https://ai.blawby.com/api/files/{fileId})
 * which is directly usable by the remote backend API.
 */
export const uploadPracticeLogo = async (
  file: File,
  practiceId: string,
  onProgress?: (percentage: number) => void
): Promise<string> => {
  if (!practiceId) {
    throw new Error('Practice id is required');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error('Logo files must be 5 MB or smaller.');
  }

  const result = await uploadWithProgress(file, {
    practiceId,
    onProgress: (progress) => {
      onProgress?.(progress.percentage);
    }
  });

  // Worker returns absolute public URL - use directly
  return result.url;
};
