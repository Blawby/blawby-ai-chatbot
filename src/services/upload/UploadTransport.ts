/**
 * Upload Transport Service
 * 
 * Handles file uploads with progress tracking using XHR.
 * Integrates with existing Cloudflare Workers /api/files/upload endpoint.
 */

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  storageKey: string;
}

export interface UploadOptions {
  practiceId: string;
  conversationId: string;
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Upload a file with progress tracking using XMLHttpRequest
 * 
 * @param file - The file to upload
 * @param options - Upload configuration and callbacks
 * @returns Promise that resolves with upload result
 */
export async function uploadWithProgress(
  file: File,
  options: UploadOptions
): Promise<UploadResult> {
  const { practiceId, conversationId, onProgress, onSuccess, onError, signal } = options;

  return new Promise((resolve, reject) => {
    // Preflight abort check - if already aborted, don't create XHR
    if (signal?.aborted) {
      const abortError = new Error('Upload cancelled');
      abortError.name = 'AbortError';
      reject(abortError);
      return;
    }

    const xhr = new XMLHttpRequest();
    
    // Track last progress values for accurate final progress update
    let lastProgress: { loaded: number; total: number } | null = null;

    // Store abort handler for cleanup
    let abortHandler: (() => void) | null = null;

    // Cleanup function to remove abort signal listener
    const cleanup = () => {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
    };

    // Wrapper functions that ensure cleanup is called
    const resolveWithCleanup = (result: UploadResult) => {
      cleanup();
      resolve(result);
    };

    const rejectWithCleanup = (error: Error) => {
      cleanup();
      reject(error);
    };

    // Handle upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        lastProgress = {
          loaded: event.loaded,
          total: event.total
        };
        const progress: UploadProgress = {
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 90) // Cap at 90% during upload
        };
        onProgress(progress);
      }
    });

    // Handle successful upload
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          
          if (response.success && response.data) {
            const result: UploadResult = {
              fileId: response.data.fileId,
              fileName: response.data.fileName,
              fileType: response.data.fileType,
              fileSize: response.data.fileSize,
              url: response.data.url,
              storageKey: response.data.storageKey || (response.data.fileExtension 
                ? `uploads/${practiceId}/${conversationId}/${response.data.fileId}.${response.data.fileExtension}`
                : `uploads/${practiceId}/${conversationId}/${response.data.fileId}`)
            };

            // Final progress update to 100%
            if (onProgress) {
              const total = lastProgress?.total || file.size;
              const _loaded = lastProgress?.loaded || file.size;
              onProgress({
                loaded: total, // Use total as loaded for 100% completion
                total,
                percentage: 100
              });
            }

            onSuccess?.(result);
            resolveWithCleanup(result);
          } else {
            const error = new Error(response.message || 'Upload failed: Invalid response format');
            onError?.(error);
            rejectWithCleanup(error);
          }
        } catch (parseError) {
          const error = new Error(`Upload failed: Invalid JSON response - ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
          onError?.(error);
          rejectWithCleanup(error);
        }
      } else {
        const error = new Error(`Upload failed: HTTP ${xhr.status} - ${xhr.statusText}`);
        onError?.(error);
        rejectWithCleanup(error);
      }
    });

    // Handle network errors
    xhr.addEventListener('error', () => {
      const error = new Error('Network error during upload');
      onError?.(error);
      rejectWithCleanup(error);
    });

    // Handle abort
    xhr.addEventListener('abort', () => {
      const error = new Error('Upload cancelled');
      onError?.(error);
      rejectWithCleanup(error);
    });

    // Handle abort signal
    if (signal) {
      // Preflight abort check - if already aborted, don't attach listener
      if (signal.aborted) {
        const abortError = new Error('Upload cancelled');
        abortError.name = 'AbortError';
        rejectWithCleanup(abortError);
        return;
      }
      
      abortHandler = () => {
        xhr.abort();
      };
      signal.addEventListener('abort', abortHandler);
    }

    // Build FormData (matches existing endpoint format)
    const formData = new FormData();
    formData.append('file', file);
    formData.append('practiceId', practiceId);
    formData.append('conversationId', conversationId);

    // Send request to existing endpoint
    xhr.open('POST', '/api/files/upload');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.send(formData);
  });
}

/**
 * Cancel an ongoing upload
 * 
 * @param xhr - The XMLHttpRequest instance to cancel
 */
export function cancelUpload(xhr: XMLHttpRequest): void {
  if (xhr.readyState !== XMLHttpRequest.DONE) {
    xhr.abort();
  }
}

/**
 * Validate file before upload
 * 
 * @param file - The file to validate
 * @returns Validation result with error message if invalid
 */
export function validateFile(file: File): { isValid: boolean; error?: string } {
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  const ALLOWED_TYPES = [
    'image/jpeg',
    'image/jpg', // Retained for legacy systems that may report this non-standard MIME type
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size must be less than ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'File type not supported'
    };
  }

  return { isValid: true };
}
