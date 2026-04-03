import { uploadFileViaBackend } from '@/shared/lib/uploadsApi';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Upload a practice logo file.
 * 
 * Uses the backend uploads API and expects a stable public URL to be available
 * after confirmation so the practice record can persist it directly.
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

  const result = await uploadFileViaBackend({
    file,
    uploadContext: 'asset',
    entityId: practiceId,
    onProgress: (progress) => {
      onProgress?.(progress.percentage);
    },
  });

  if (!result.publicUrl) {
    throw new Error('Logo upload completed without a public URL.');
  }

  return result.publicUrl;
};
