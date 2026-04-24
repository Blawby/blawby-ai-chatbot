import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { FileAttachment } from '../../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';

interface UseFileUploadOptions {
  practiceId: string | undefined;
  conversationId: string | undefined;
  enabled: boolean;
}

interface UploadResponseData {
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  url?: string;
  storageKey?: string;
}

const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'pif',
  'scr',
  'vbs',
  'js',
  'jar',
  'msi',
  'app',
]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const createRandomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getFileExtension = (fileName: string): string => {
  const trimmed = fileName.trim().toLowerCase();
  const lastDotIndex = trimmed.lastIndexOf('.');
  if (lastDotIndex === -1) return '';
  return trimmed.slice(lastDotIndex + 1);
};

const extractUploadData = (value: unknown): UploadResponseData | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : record;

  const fileId = typeof candidate.fileId === 'string' ? candidate.fileId : null;
  if (!fileId) return null;

  return {
    fileId,
    fileName: typeof candidate.fileName === 'string' ? candidate.fileName : undefined,
    fileSize: typeof candidate.fileSize === 'number' ? candidate.fileSize : undefined,
    fileType: typeof candidate.fileType === 'string' ? candidate.fileType : undefined,
    url: typeof candidate.url === 'string' ? candidate.url : undefined,
    storageKey: typeof candidate.storageKey === 'string' ? candidate.storageKey : undefined,
  };
};

export const useFileUpload = ({ practiceId, conversationId, enabled }: UseFileUploadOptions) => {
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const xhrRef = useRef<Map<string, XMLHttpRequest>>(new Map());

  const isReadyToUpload = enabled && Boolean(practiceId);

  const removeUploadingFile = useCallback((fileId: string) => {
    setUploadingFiles((current) => current.filter((file) => file.id !== fileId));
  }, []);

  const finalizeUpload = useCallback((fileId: string, attachment: FileAttachment) => {
    removeUploadingFile(fileId);
    setPreviewFiles((current) => [...current, attachment]);
  }, [removeUploadingFile]);

  const handleUploadFailure = useCallback((fileId: string, error: unknown) => {
    removeUploadingFile(fileId);
    console.warn('[useFileUpload] Upload failed', error);
  }, [removeUploadingFile]);

  const uploadSingleFile = useCallback((file: File): Promise<FileAttachment | null> => {
    if (!isReadyToUpload || !practiceId) return Promise.resolve(null);

    const fileName = typeof file.name === 'string' ? file.name.trim() : '';
    if (!fileName) return Promise.resolve(null);
    if (file.size > MAX_FILE_SIZE_BYTES) return Promise.resolve(null);
    if (BLOCKED_EXTENSIONS.has(getFileExtension(fileName))) return Promise.resolve(null);

    const uploadId = createRandomId();
    const uploadingEntry: UploadingFile = {
      id: uploadId,
      file,
      status: 'uploading',
      progress: 0,
    };

    setUploadingFiles((current) => [...current, uploadingEntry]);

    return new Promise<FileAttachment | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current.set(uploadId, xhr);

      const cleanup = () => {
        xhrRef.current.delete(uploadId);
      };

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progress = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        setUploadingFiles((current) => current.map((entry) => (
          entry.id === uploadId ? { ...entry, progress } : entry
        )));
      };

      xhr.onload = () => {
        cleanup();
        try {
          if (xhr.status !== 200) {
            throw new Error(`HTTP ${xhr.status}`);
          }
          const parsed = JSON.parse(xhr.responseText) as unknown;
          const responseData = extractUploadData(parsed);
          if (!responseData?.fileId) {
            throw new Error('Missing fileId in upload response');
          }

          const attachment: FileAttachment = {
            id: responseData.fileId,
            name: responseData.fileName ?? file.name,
            size: responseData.fileSize ?? file.size,
            type: responseData.fileType ?? file.type,
            url: responseData.url ?? '',
            storageKey: responseData.storageKey,
          };
          finalizeUpload(uploadId, attachment);
          resolve(attachment);
        } catch (error) {
          handleUploadFailure(uploadId, error);
          resolve(null);
        }
      };

      xhr.onerror = () => {
        cleanup();
        handleUploadFailure(uploadId, new Error('Network error'));
        resolve(null);
      };

      xhr.onabort = () => {
        cleanup();
        removeUploadingFile(uploadId);
        resolve(null);
      };

      xhr.onloadend = () => {
        cleanup();
      };

      xhr.open('POST', '/api/files/upload', true);
      xhr.withCredentials = true;

      const formData = new FormData();
      formData.append('file', file);
      if (practiceId) {
        formData.append('practiceId', practiceId);
      }
      if (conversationId) {
        formData.append('conversationId', conversationId);
      }

      try {
        xhr.send(formData);
      } catch (error) {
        cleanup();
        handleUploadFailure(uploadId, error);
        resolve(null);
      }
    });
  }, [conversationId, finalizeUpload, handleUploadFailure, isReadyToUpload, practiceId, removeUploadingFile]);

  const handleFileSelect = useCallback(async (files: File[]): Promise<FileAttachment[]> => {
    if (!enabled || !isReadyToUpload || !Array.isArray(files) || files.length === 0) {
      return [];
    }

    const uploadedAttachments: FileAttachment[] = [];
    for (const file of files) {
      const attachment = await uploadSingleFile(file);
      if (attachment) {
        uploadedAttachments.push(attachment);
      }
    }
    return uploadedAttachments;
  }, [enabled, isReadyToUpload, uploadSingleFile]);

  const cancelUpload = useCallback((fileId: string) => {
    if (!enabled) return;
    const xhr = xhrRef.current.get(fileId);
    if (xhr && xhr.readyState !== XMLHttpRequest.DONE) {
      xhr.abort();
    }
    xhrRef.current.delete(fileId);
    removeUploadingFile(fileId);
  }, [enabled, removeUploadingFile]);

  const handleCameraCapture = useCallback(async (file: File): Promise<void> => {
    if (!enabled) return;
    await handleFileSelect([file]);
  }, [enabled, handleFileSelect]);

  const handleMediaCapture = useCallback((blob: Blob, type: 'audio' | 'video') => {
    if (!enabled) return;
    const ext = type === 'audio' ? 'webm' : 'mp4';
    const file = new File([blob], `Recording_${new Date().toISOString()}.${ext}`, { type: blob.type });
    void handleFileSelect([file]);
  }, [enabled, handleFileSelect]);

  const removePreviewFile = useCallback((index: number) => {
    if (!enabled) return;
    setPreviewFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }, [enabled]);

  const clearPreviewFiles = useCallback(() => {
    if (!enabled) return;
    setPreviewFiles([]);
  }, [enabled]);

  return useMemo(() => ({
    previewFiles: enabled ? previewFiles : [],
    uploadingFiles: enabled ? uploadingFiles : [],
    isReadyToUpload: enabled ? isReadyToUpload : false,
    handleFileSelect,
    handleCameraCapture,
    removePreviewFile,
    clearPreviewFiles,
    cancelUpload,
    handleMediaCapture,
    isRecording: enabled ? isRecording : false,
    setIsRecording: enabled ? setIsRecording : (() => {}) as typeof setIsRecording,
  }), [
    cancelUpload,
    clearPreviewFiles,
    enabled,
    handleCameraCapture,
    handleFileSelect,
    handleMediaCapture,
    isReadyToUpload,
    isRecording,
    previewFiles,
    removePreviewFile,
    uploadingFiles,
  ]);
};
