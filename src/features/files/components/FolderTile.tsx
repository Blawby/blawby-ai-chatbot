import { Briefcase, Inbox } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface FolderTileItem {
  id: string;
  kind: 'matter' | 'intake';
  label: string;
}

interface FolderTileProps {
  folder: FolderTileItem;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const folderIcon = (kind: FolderTileItem['kind']) => (
  kind === 'intake' ? Inbox : Briefcase
);

const kindLabel = (kind: FolderTileItem['kind']) => (
  kind === 'intake' ? 'Intake' : 'Matter'
);

export const FolderTile = ({ folder, active = false, onClick, className }: FolderTileProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'flex items-center gap-3 rounded-2xl border bg-surface-card px-4 py-3 text-left transition-all',
      'hover:border-line-glass/60 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-500',
      active ? 'border-accent-500 ring-1 ring-accent-500' : 'border-line-glass/30',
      className,
    )}
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/10 text-[rgb(var(--accent-foreground))]">
      <Icon icon={folderIcon(folder.kind)} className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-input-text" title={folder.label}>
        {folder.label}
      </p>
      <p className="text-xs text-input-placeholder">{kindLabel(folder.kind)}</p>
    </div>
  </button>
);

export default FolderTile;
