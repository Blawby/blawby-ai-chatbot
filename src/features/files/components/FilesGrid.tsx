import type { ComponentChildren } from 'preact';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { FileTile } from './FileTile';
import type { OrgFile } from '@/features/files/utils/fileCategory';

interface FilesGridProps {
  files: OrgFile[];
  isLoading?: boolean;
  emptyState?: ComponentChildren;
  onFileClick?: (file: OrgFile) => void;
}

const FILE_GRID_CLASS = 'grid grid-cols-1 gap-3 @sm:grid-cols-2 @md:grid-cols-3 @lg:grid-cols-4 @xl:grid-cols-5';

export const FilesGrid = ({
  files,
  isLoading = false,
  emptyState,
  onFileClick,
}: FilesGridProps) => {
  if (isLoading) {
    return (
      <div className={FILE_GRID_CLASS}>
        {Array.from({ length: 8 }).map((_, idx) => (
          <SkeletonLoader key={`file-skel-${idx}`} className="aspect-[4/3] rounded-lg" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className={FILE_GRID_CLASS}>
      {files.map((file) => (
        <FileTile
          key={file.id}
          file={file}
          onClick={onFileClick ? () => onFileClick(file) : undefined}
        />
      ))}
    </div>
  );
};

export default FilesGrid;
