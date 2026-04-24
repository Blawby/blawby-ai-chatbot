import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { UploadSurface, type UploadSurfaceItem } from '@/shared/ui/upload/organisms/UploadSurface';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import {
  listMatterUploads,
  uploadFileViaBackend,
  type BackendUploadRecord,
} from '@/shared/lib/uploadsApi';

interface MatterFilesPanelProps {
  matterId: string;
  isPrivilegedUploads?: boolean;
}

type UploadingPanelFile = {
  id: string;
  file: File;
  progress: number;
};

const makeUploadId = (): string => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const triggerDownload = (url: string, name: string) => {
  const link = document.createElement('a');
  link.href = url;
  try {
    if (new URL(url).origin !== window.location.origin) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.download = name;
    }
  } catch {
    link.download = name;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const openFile = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

export function MatterFilesPanel({ matterId, isPrivilegedUploads = true }: MatterFilesPanelProps) {
  const [uploads, setUploads] = useState<BackendUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingPanelFile[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dragDepthRef = useRef(0);
  const { showSuccess, showError } = useToastContext();
  const isUploading = uploadingFiles.length > 0;

  const hasDraggedFiles = (event: DragEvent) => {
    const types = event.dataTransfer?.types;
    return Boolean(types && Array.from(types).includes('Files'));
  };

  const fetchUploads = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    listMatterUploads({ matterId, signal: controller.signal })
      .then((records) => {
        setUploads(records.filter((record) => record.status === 'verified'));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load files.');
        setLoading(false);
      });
  }, [matterId]);

  const handleUploadBatch = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);

    for (const file of files) {
      const uploadId = makeUploadId();
      setUploadingFiles((prev) => [...prev, { id: uploadId, file, progress: 0 }]);

      try {
        await uploadFileViaBackend({
          file,
          uploadContext: 'matter',
          matterId,
          isPrivileged: isPrivilegedUploads,
          onProgress: (progress) => {
            setUploadingFiles((prev) => prev.map((entry) => (
              entry.id === uploadId
                ? { ...entry, progress: progress.percentage }
                : entry
            )));
          },
        });
        showSuccess('File uploaded', file.name);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        setError(message);
        showError('Upload failed', message);
      } finally {
        setUploadingFiles((prev) => prev.filter((entry) => entry.id !== uploadId));
      }
    }

    fetchUploads();
  }, [fetchUploads, isPrivilegedUploads, matterId, showError, showSuccess]);

  useEffect(() => {
    fetchUploads();
    return () => { abortRef.current?.abort(); };
  }, [fetchUploads]);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setIsDraggingFiles(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingFiles(false);
      }
    };

    const onDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      const droppedFiles = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
      if (droppedFiles.length > 0) {
        void handleUploadBatch(droppedFiles);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleUploadBatch]);

  const surfaceItems: UploadSurfaceItem[] = [
    ...uploadingFiles.map((item) => ({
      id: item.id,
      fileName: item.file.name,
      mimeType: item.file.type || 'application/octet-stream',
      fileSize: item.file.size,
      status: 'uploading' as const,
      progress: item.progress,
    })),
    ...uploads.map((upload) => ({
      id: upload.id,
      fileName: upload.file_name,
      mimeType: upload.mime_type || 'application/octet-stream',
      fileSize: upload.file_size,
      status: 'ready' as const,
      onOpen: upload.public_url ? () => openFile(upload.public_url as string) : undefined,
      onDownload: upload.public_url ? () => triggerDownload(upload.public_url as string, upload.file_name) : undefined,
    })),
  ];

  if (loading) {
    return <LoadingBlock className="p-8" label="Loading files…" />;
  }

  if (error && surfaceItems.length === 0) {
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="relative">
      <UploadSurface
        onFilesSelected={(files) => { void handleUploadBatch(files); }}
        items={surfaceItems}
        dropzoneDisabled={isUploading}
        emptyStateLabel={null}
      />

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {isDraggingFiles ? (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-accent-500 bg-accent-500/10" />
      ) : null}
    </div>
  );
}
