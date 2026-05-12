export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface PresignedUploadOptions {
  file: File;
  presignedUrl: string;
  method: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export const uploadViaPresignedUrl = async ({
  file,
  presignedUrl,
  method,
  onProgress,
  signal,
}: PresignedUploadOptions): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    let abortHandler: (() => void) | null = null;

    const cleanup = () => {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
    };

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress({
        loaded: event.loaded,
        total: event.total,
        percentage: Math.round((event.loaded / event.total) * 100),
      });
    });

    xhr.addEventListener('load', () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed with HTTP ${xhr.status}`));
    });

    xhr.addEventListener('error', () => {
      cleanup();
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      cleanup();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    });

    if (signal) {
      abortHandler = () => xhr.abort();
      signal.addEventListener('abort', abortHandler);
    }

    xhr.open(method.toUpperCase(), presignedUrl);

    if (method.toUpperCase() === 'POST') {
      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
      return;
    }

    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
};
