import type { ComponentChildren } from 'preact';

import { Icon } from '@/shared/ui/Icon';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
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

const COLUMNS: DataTableColumn[] = [
  { id: 'name', label: 'Name', isPrimary: true },
  { id: 'source', label: 'Source', hideAt: 'md' },
  { id: 'type', label: 'Type', hideAt: 'lg' },
  { id: 'size', label: 'Size', align: 'right', hideAt: 'sm' },
  { id: 'added', label: 'Added', align: 'right', hideAt: 'md' },
];

export const FilesList = ({
  files,
  isLoading = false,
  emptyState,
  onFileClick,
}: FilesListProps) => {
  const rows: DataTableRow[] = files.map((file) => {
    const fileType = getFileTypeConfig(file.fileName, file.mimeType);
    const association = folderForFile(file);
    const sourceLabel = association.kind === 'loose' ? 'Loose file' : association.label;
    return {
      id: file.id,
      onClick: onFileClick ? () => onFileClick(file) : undefined,
      cells: {
        name: (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-panel text-input-placeholder">
              <Icon icon={fileType.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate" title={file.fileName}>{file.fileName}</span>
          </div>
        ),
        source: sourceLabel,
        type: fileType.label,
        size: formatFileSize(file.fileSize),
        added: file.createdAt ? formatRelativeTime(file.createdAt) : '—',
      },
    };
  });

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      loading={isLoading}
      emptyState={emptyState}
      stickyHeader
      density="compact"
      className="panel overflow-hidden"
      bodyClassName="bg-transparent"
    />
  );
};

export default FilesList;
