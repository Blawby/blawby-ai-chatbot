import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { apiClient, isAbortError } from '@/shared/lib/apiClient';
import { uploadDownloadPath } from '@/config/urls';
import { uploadIntakeFile } from '@/features/intake/api/intakeFilesApi';
import type { FileAttachment } from '../../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';

interface UseFileUploadOptions {
  practiceId: string | undefined;
  conversationId: string | undefined;
  enabled: boolean;
  /**
   * When set, post-submit chat uploads are routed through the scoped intake
   * files API (presign → R2 → confirm) and the resulting FileAttachment is
   * stamped with `uploadId` and `source: 'intake'`. When omitted, uploads
   * fall back to the legacy worker R2 `/api/files/upload` pipeline.
   */
  intakeUuid?: string | null;
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

export const useFileUpload = ({ practiceId, conversationId, enabled, intakeUuid }: UseFileUploadOptions) => {
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  // The composer is upload-ready when either:
  //  - we have a practiceId (legacy worker R2 path), OR
  //  - we have an intakeUuid (scoped intake files API path).
  // The intake path takes precedence when set.
  const isReadyToUpload = enabled && Boolean(intakeUuid || practiceId);

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

  const uploadViaIntake = useCallback(async (
    file: File,
    uploadId: string,
    controller: AbortController,
  ): Promise<FileAttachment | null> => {
    if (!intakeUuid) return null;
    try {
      const result = await uploadIntakeFile({
        intakeUuid,
        file,
        signal: controller.signal,
        onProgress: ({ percentage }) => {
          setUploadingFiles((current) => current.map((entry) => (
            entry.id === uploadId ? { ...entry, progress: percentage } : entry
          )));
        },
      });
      const attachment: FileAttachment = {
        id: result.id,
        name: result.fileName,
        size: result.fileSize,
        type: result.mimeType ?? file.type ?? 'application/octet-stream',
        url: uploadDownloadPath(result.uploadId),
        storageKey: result.storageKey ?? undefined,
        uploadId: result.uploadId,
        source: 'intake',
      };
      finalizeUpload(uploadId, attachment);
      return attachment;
    } catch (error) {
      if (isAbortError(error)) {
        removeUploadingFile(uploadId);
        return null;
      }
      handleUploadFailure(uploadId, error);
      return null;
    }
  }, [finalizeUpload, handleUploadFailure, intakeUuid, removeUploadingFile]);

  const uploadViaWorker = useCallback(async (
    file: File,
    uploadId: string,
    controller: AbortController,
  ): Promise<FileAttachment | null> => {
    if (!practiceId) return null;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('practiceId', practiceId);
    if (conversationId) formData.append('conversationId', conversationId);

    try {
      const { data } = await apiClient.upload<unknown>('/api/files/upload', formData, {
        signal: controller.signal,
        onProgress: ({ percent }) => {
          setUploadingFiles((current) => current.map((entry) => (
            entry.id === uploadId ? { ...entry, progress: percent } : entry
          )));
        },
      });
      const responseData = extractUploadData(data);
      if (!responseData?.fileId) throw new Error('Missing fileId in upload response');
      const attachment: FileAttachment = {
        id: responseData.fileId,
        name: responseData.fileName ?? file.name,
        size: responseData.fileSize ?? file.size,
        type: responseData.fileType ?? file.type,
        url: responseData.url ?? '',
        storageKey: responseData.storageKey,
        source: 'worker',
      };
      finalizeUpload(uploadId, attachment);
      return attachment;
    } catch (error) {
      if (isAbortError(error)) {
        removeUploadingFile(uploadId);
        return null;
      }
      handleUploadFailure(uploadId, error);
      return null;
    }
  }, [conversationId, finalizeUpload, handleUploadFailure, practiceId, removeUploadingFile]);

  const uploadSingleFile = useCallback(async (file: File): Promise<FileAttachment | null> => {
    if (!isReadyToUpload) return null;

    const fileName = typeof file.name === 'string' ? file.name.trim() : '';
    if (!fileName) return null;
    if (file.size > MAX_FILE_SIZE_BYTES) return null;
    if (BLOCKED_EXTENSIONS.has(getFileExtension(fileName))) return null;

    const uploadId = createRandomId();
    setUploadingFiles((current) => [...current, { id: uploadId, file, status: 'uploading', progress: 0 }]);

    const controller = new AbortController();
    controllersRef.current.set(uploadId, controller);

    try {
      if (intakeUuid) {
        return await uploadViaIntake(file, uploadId, controller);
      }
      return await uploadViaWorker(file, uploadId, controller);
    } finally {
      controllersRef.current.delete(uploadId);
    }
  }, [intakeUuid, isReadyToUpload, uploadViaIntake, uploadViaWorker]);

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

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const c of controllers.values()) c.abort();
      controllers.clear();
    };
  }, []);

  const cancelUpload = useCallback((fileId: string) => {
    if (!enabled) return;
    controllersRef.current.get(fileId)?.abort();
    controllersRef.current.delete(fileId);
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
