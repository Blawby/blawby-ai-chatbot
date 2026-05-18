import { FileCard } from '@/shared/ui/upload/molecules/FileCard';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { folderForFile, type OrgFile } from '@/features/files/utils/fileCategory';
import { useUploadPreviewUrl } from '@/features/files/hooks/useUploadPreviewUrl';
import { isImageFile } from '@/shared/utils/fileTypeUtils';

interface FileTileProps {
  file: OrgFile;
  onClick?: () => void;
}

export const FileTile = ({ file, onClick }: FileTileProps) => {
  const association = folderForFile(file);
  const associationLabel = association.kind === 'loose' ? undefined : association.label;
  const timestamp = file.createdAt ? formatRelativeTime(file.createdAt) : undefined;
  const { url: thumbnailUrl } = useUploadPreviewUrl(
    file.uploadId,
    file.publicUrl,
    isImageFile(file.mimeType),
  );
  return (
    <FileCard
      variant="tile"
      fileName={file.fileName}
      mimeType={file.mimeType}
      status={file.status ?? 'completed'}
      imageUrl={thumbnailUrl ?? undefined}
      associationLabel={associationLabel}
      timestampLabel={timestamp}
      onClick={onClick}
    />
  );
};

export default FileTile;
