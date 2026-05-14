import type { ComponentChildren } from 'preact';
import { Briefcase, Inbox } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
import type { OrgFolder } from '@/features/files/hooks/useOrgFiles';

interface FoldersListProps {
  folders: OrgFolder[];
  isLoading?: boolean;
  emptyState?: ComponentChildren;
  onFolderClick?: (folder: OrgFolder) => void;
}

const COLUMNS: DataTableColumn[] = [
  { id: 'name', label: 'Name', isPrimary: true },
  { id: 'type', label: 'Type', hideAt: 'sm' },
];

export const FoldersList = ({
  folders,
  isLoading = false,
  emptyState,
  onFolderClick,
}: FoldersListProps) => {
  const rows: DataTableRow[] = folders.map((folder) => {
    const icon = folder.kind === 'matter' ? Briefcase : Inbox;
    const typeLabel = folder.kind === 'matter' ? 'Matter' : 'Intake';
    return {
      id: folder.id,
      onClick: onFolderClick ? () => onFolderClick(folder) : undefined,
      cells: {
        name: (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-utility">
              <Icon icon={icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate" title={folder.label}>{folder.label}</span>
          </div>
        ),
        type: typeLabel,
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
    />
  );
};

export default FoldersList;
