import { useCallback } from 'preact/hooks';
import { InspectorSectionSkeleton } from '@/shared/ui/layout/skeleton-presets/InspectorSectionSkeleton';
import { UploadSurface, type UploadSurfaceItem } from '@/shared/ui/upload/organisms/UploadSurface';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useMatterFiles } from '@/features/matters/hooks/useMatterFiles';

// This complements (not replaces) MatterFilesPanel with a compact inspector-specific
// surface: quick upload + linked-file visibility while preserving existing matter tabs.
type MatterFilesSectionProps = {
  practiceId: string;
  matterId: string;
};

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg,.heic,.heif,.mp4,.mov,.mp3,.wav,.m4a';

export const MatterFilesSection = ({ practiceId, matterId }: MatterFilesSectionProps) => {
  const {
    files,
    isLoading,
    error,
    uploadingFiles,
    isUploading,
    uploadMatterFile,
  } = useMatterFiles(practiceId, matterId);
  const { showSuccess, showError } = useToastContext();

  const handleFileBatch = useCallback(async (selectedFiles: File[]) => {
    for (const file of selectedFiles) {
      try {
        await uploadMatterFile(file);
        showSuccess('File uploaded', file.name);
      } catch (err) {
        showError(
          'Upload failed',
          err instanceof Error ? err.message : `Failed to upload ${file.name}`
        );
      }
    }
  }, [showError, showSuccess, uploadMatterFile]);

  const openFile = useCallback((url: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const downloadFile = useCallback((url: string | null, name: string) => {
    if (!url) return;
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
  }, []);

  const surfaceItems: UploadSurfaceItem[] = [
    ...uploadingFiles.map((item) => ({
      id: item.id,
      fileName: item.file.name,
      mimeType: item.file.type || 'application/octet-stream',
      fileSize: item.file.size,
      status: 'uploading' as const,
      progress: item.progress,
    })),
    ...files.map((file) => ({
      id: file.id,
      fileName: file.upload.fileName,
      mimeType: file.upload.mimeType ?? file.upload.fileType ?? 'application/octet-stream',
      fileSize: file.upload.fileSize,
      status: 'ready' as const,
      onOpen: file.upload.publicUrl ? () => openFile(file.upload.publicUrl) : undefined,
      onDownload: file.upload.publicUrl ? () => downloadFile(file.upload.publicUrl, file.upload.fileName) : undefined,
    })),
  ];

  if (isLoading && files.length === 0) {
    return <InspectorSectionSkeleton wideRows={[true, false, true]} />;
  }

  return (
    <div className="space-y-2 px-5 py-1.5">
      <UploadSurface
        onFilesSelected={(selected) => { void handleFileBatch(selected); }}
        items={surfaceItems}
        dropzoneAccept={ACCEPTED_FILE_TYPES}
        dropzoneDisabled={isLoading || isUploading}
        emptyStateLabel={null}
      />

      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}
    </div>
  );
};
