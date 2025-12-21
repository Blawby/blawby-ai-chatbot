import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { useSessionContext } from '../contexts/SessionContext.js';
import { FileAttachment } from '../../worker/types';
import { uploadWithProgress, validateFile } from '../services/upload/UploadTransport';

export type FileStatus = 
  | 'uploading'      // Browser → Workers
  | 'uploaded'       // Stored in R2, queued for processing
  | 'processing'     // Adobe extraction in progress
  | 'analyzing'      // AI analysis in progress  
  | 'completed'      // Ready to use
  | 'failed';        // Error occurred

export interface UploadingFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  fileId?: string;
  storageKey?: string;
  error?: string;
}

interface UploadResponse {
  fileName: string;
  fileSize?: number;
  fileType: string;
  url: string;
}

interface UseFileUploadOptions {
  practiceId?: string;
  conversationId?: string;
  onError?: (error: string) => void;
}

/**
 * Hook that uses blawby-ai practice for all file uploads
 * This is the preferred way to use file upload in components
 */
export const useFileUploadWithContext = ({ conversationId, onError }: Omit<UseFileUploadOptions, 'practiceId'>) => {
  const { activePracticeId } = useSessionContext();
  return useFileUpload({ practiceId: activePracticeId ?? undefined, conversationId, onError });
};

// Utility function to upload a file to backend
async function _uploadFileToBackend(file: File, practiceId: string, conversationId: string, signal?: AbortSignal): Promise<UploadResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('practiceId', practiceId);
    formData.append('conversationId', conversationId);

    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData,
      signal,
      credentials: 'include'
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(error?.error || 'File upload failed');
    }
    
    const result = await response.json() as { data: UploadResponse };
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Upload cancelled');
    }
    throw error;
  }
}

/**
 * Legacy hook that requires practiceId parameter
 * @deprecated Use useFileUploadWithContext() instead
 */
export const useFileUpload = ({ practiceId, conversationId, onError }: UseFileUploadOptions) => {
  const [previewFiles, setPreviewFiles] = useState<FileAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const resolvedPracticeId = (practiceId ?? '').trim();
  const resolvedConversationId = (conversationId ?? '').trim();

  // Check if we're ready to upload files
  const isReadyToUpload = resolvedPracticeId !== '' && resolvedConversationId !== '';


  // Upload files with progress tracking
  const uploadFiles = useCallback(async (files: File[]) => {
    if (!isReadyToUpload) {
      const error = `Cannot upload files yet. Waiting for conversation to initialize. practiceId: "${resolvedPracticeId}", conversationId: "${resolvedConversationId}"`;
      console.error(error);
      onError?.(error);
      return;
    }

    // Validate files first
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      const validation = validateFile(file);
      if (validation.isValid) {
        validFiles.push(file);
      } else {
        invalidFiles.push(`${file.name}: ${validation.error}`);
      }
    });

    if (invalidFiles.length > 0) {
      onError?.(`Invalid files: ${invalidFiles.join(', ')}`);
    }

    if (validFiles.length === 0) return;

    // Create upload tracking entries
    const newUploads: UploadingFile[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'uploading',
      progress: 0
    }));

    setUploadingFiles(prev => [...prev, ...newUploads]);

    // Upload each file with progress tracking in parallel
    const uploadPromises = newUploads.map(async (upload) => {
      const abortController = new AbortController();
      abortControllers.current.set(upload.id, abortController);

      try {
        const result = await uploadWithProgress(upload.file, {
          practiceId: resolvedPracticeId,
          conversationId: resolvedConversationId,
          onProgress: (progress) => {
            setUploadingFiles(prev => prev.map(f => 
              f.id === upload.id 
                ? { ...f, progress: progress.percentage }
                : f
            ));
          },
          onSuccess: (result) => {
            
            // Update file to uploaded status
            setUploadingFiles(prev => prev.map(f => 
              f.id === upload.id 
                ? { 
                    ...f, 
                    status: 'uploaded',
                    progress: 100,
                    fileId: result.fileId,
                    storageKey: result.storageKey
                  }
                : f
            ));
            
            // After a brief delay, move to previewFiles for smooth UX
            setTimeout(() => {
              
              setPreviewFiles(prev => [...prev, {
                id: result.fileId,
                name: upload.file.name,
                size: upload.file.size,
                type: upload.file.type,
                url: `/api/files/${result.fileId}`, // Use proper file URL instead of blob URL
                storageKey: result.storageKey
              }]);
              
              // Remove from uploadingFiles
              setUploadingFiles(prev => prev.filter(f => f.id !== upload.id));
            }, 500);
          },
          onError: (error) => {
            setUploadingFiles(prev => prev.map(f => 
              f.id === upload.id 
                ? { ...f, status: 'failed', error: error.message }
                : f
            ));
            onError?.(`Failed to upload ${upload.file.name}: ${error.message}`);
          },
          signal: abortController.signal
        });

        return result;
      } catch (error) {
        setUploadingFiles(prev => prev.map(f => 
          f.id === upload.id 
            ? { ...f, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }
            : f
        ));
        throw error;
      } finally {
        abortControllers.current.delete(upload.id);
      }
    });

    // Wait for all uploads to complete (or fail)
    try {
      await Promise.all(uploadPromises);
    } catch (error) {
      // Individual upload errors are already handled in the map function above
      // This catch block ensures the function doesn't throw unhandled promise rejections
      console.warn('Some uploads failed:', error);
    }
  }, [resolvedPracticeId, resolvedConversationId, isReadyToUpload, onError]);

  // Handle camera capture
  const handleCameraCapture = useCallback(async (file: File) => {
    await uploadFiles([file]);
  }, [uploadFiles]);

  // Handle file selection (now uses the new upload progress system)
  const handleFileSelect = useCallback(async (files: File[]) => {
    if (!isReadyToUpload) {
      const error = `Cannot upload files yet. Waiting for conversation to initialize. practiceId: "${resolvedPracticeId}", conversationId: "${resolvedConversationId}"`;
      console.error(error);
      onError?.(error);
      return [];
    }

    // Use the new upload system with progress tracking
    await uploadFiles(files);
    
    // Return empty array since files will be handled by the upload system
    // and moved to previewFiles automatically when complete
    return [];
  }, [uploadFiles, isReadyToUpload, onError, resolvedPracticeId, resolvedConversationId]);

  // Cancel upload
  const cancelUpload = useCallback((uploadId: string) => {
    const controller = abortControllers.current.get(uploadId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(uploadId);
    }
    
    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
  }, []);

  // Remove preview file
  const removePreviewFile = useCallback((index: number) => {
    setPreviewFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Clear all preview files
  const clearPreviewFiles = useCallback(() => {
    setPreviewFiles([]);
  }, []);

  // Clear all uploading files
  const clearUploadingFiles = useCallback(() => {
    // Cancel all ongoing uploads
    abortControllers.current.forEach(controller => controller.abort());
    abortControllers.current.clear();
    setUploadingFiles([]);
  }, []);

  // Handle media capture (audio/video)
  const handleMediaCapture = useCallback((blob: Blob, _type: 'audio' | 'video') => {
    const url = URL.createObjectURL(blob);
    const file: FileAttachment = {
      id: `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Generate unique ID
      name: `Recording_${new Date().toISOString()}.webm`,
      size: blob.size,
      type: blob.type,
      url,
    };

    return file;
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounter.current -= 1;
    
    // Only reset dragging state when we've left all drag elements
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    // Get all files from the drop event
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    
    if (droppedFiles.length === 0) return;

    // Separate different types of files
    const imageFiles = droppedFiles.filter(file => file.type.startsWith('image/'));
    const videoFiles = droppedFiles.filter(file => file.type.startsWith('video/'));
    const otherFiles = droppedFiles.filter(file => 
      !file.type.startsWith('image/') && 
      !file.type.startsWith('video/')
    );

    // Apply file type validation
    const mediaFiles = [...imageFiles, ...videoFiles];
    const safeOtherFiles = otherFiles.filter(file => {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      const disallowedExtensions = ['zip', 'exe', 'bat', 'cmd', 'msi', 'app'];
      return !disallowedExtensions.includes(fileExtension || '');
    });

    // Handle all valid files together
    const allValidFiles = [...mediaFiles, ...safeOtherFiles];
    if (allValidFiles.length > 0) {
      await handleFileSelect(allValidFiles);
    }

    // Show alert if any files were filtered out
    if (safeOtherFiles.length < otherFiles.length) {
      onError?.('Some files were not uploaded because they have disallowed file extensions (zip, exe, etc.)');
    }
  }, [handleFileSelect, onError]);

  // Setup global drag handlers with automatic cleanup
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.addEventListener('dragenter', handleDragEnter);
      document.body.addEventListener('dragleave', handleDragLeave);
      document.body.addEventListener('dragover', handleDragOver);
      document.body.addEventListener('drop', handleDrop);

      return () => {
        document.body.removeEventListener('dragenter', handleDragEnter);
        document.body.removeEventListener('dragleave', handleDragLeave);
        document.body.removeEventListener('dragover', handleDragOver);
        document.body.removeEventListener('drop', handleDrop);
      };
    }
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return {
    previewFiles,
    uploadingFiles,
    isDragging,
    setIsDragging,
    handleCameraCapture,
    handleFileSelect,
    handleMediaCapture,
    removePreviewFile,
    clearPreviewFiles,
    clearUploadingFiles,
    cancelUpload,
    uploadFiles,
    isReadyToUpload
  };
}; 
