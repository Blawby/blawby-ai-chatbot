import type { ComponentChildren } from 'preact';

import { Icon } from '@/shared/ui/Icon';
import { EntityList } from '@/shared/ui/list/EntityList';
import { formatFileSize } from '@/shared/utils/mediaAggregation';
import { getFileTypeConfig } from '@/shared/utils/fileTypeUtils';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { folderForFile, type OrgFile } from '@/features/files/utils/fileCategory';

interface FilesListProps {
  files: OrgFile[];
  isLoading?: boolean;
  emptyState?: ComponentChildren;
  onFileClick?: (file: OrgFile) => void;
}

export const FilesList = ({
  files,
  isLoading = false,
  emptyState,
  onFileClick,
}: FilesListProps) => (
  <EntityList
    items={files}
    onSelect={(file) => onFileClick?.(file)}
    isLoading={isLoading}
    emptyState={emptyState}
    className="panel overflow-hidden"
    renderItem={(file) => {
      const fileType = getFileTypeConfig(file.fileName, file.mimeType);
      const association = folderForFile(file);
      const sourceLabel = association.kind === 'loose' ? 'Loose file' : association.label;
      return (
        <div className="flex w-full items-center gap-4 px-4 py-3 hover:bg-paper-2/10">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper-2 text-dim-2">
              <Icon icon={fileType.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate text-sm text-ink" title={file.fileName}>
              {file.fileName}
            </span>
          </div>
          <span className="hidden min-w-[100px] text-sm text-dim-2 md:block">{sourceLabel}</span>
          <span className="hidden min-w-[80px] text-sm text-dim-2 lg:block">{fileType.label}</span>
          <span className="hidden min-w-[64px] text-right text-sm tabular-nums text-dim-2 sm:block">
            {formatFileSize(file.fileSize)}
          </span>
          <span className="hidden min-w-[80px] text-right text-sm text-dim-2 md:block">
            {file.createdAt ? formatRelativeTime(file.createdAt) : '—'}
          </span>
        </div>
      );
    }}
  />
);

export default FilesList;
