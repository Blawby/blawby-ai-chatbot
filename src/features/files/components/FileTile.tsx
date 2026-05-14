import { FileCard } from '@/shared/ui/upload/molecules/FileCard';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { folderForFile, type OrgFile } from '@/features/files/utils/fileCategory';

interface FileTileProps {
  file: OrgFile;
  onClick?: () => void;
}

export const FileTile = ({ file, onClick }: FileTileProps) => {
  const association = folderForFile(file);
  const associationLabel = association.kind === 'loose' ? undefined : association.label;
  const timestamp = file.createdAt ? formatRelativeTime(file.createdAt) : undefined;
  return (
    <FileCard
      variant="tile"
      fileName={file.fileName}
      mimeType={file.mimeType}
      status="completed"
      imageUrl={file.publicUrl ?? undefined}
      associationLabel={associationLabel}
      timestampLabel={timestamp}
      onClick={onClick}
    />
  );
};

export default FileTile;
