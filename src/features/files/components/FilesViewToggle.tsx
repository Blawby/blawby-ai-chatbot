import { LayoutGrid, List } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export type FilesViewMode = 'grid' | 'list';

interface FilesViewToggleProps {
  value: FilesViewMode;
  onChange: (mode: FilesViewMode) => void;
}

const buttonClass = (active: boolean) => cn(
  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
  active
    ? 'bg-card text-ink shadow-sm'
    : 'text-dim-2 hover:text-ink'
);

export const FilesViewToggle = ({ value, onChange }: FilesViewToggleProps) => (
  <div
    className="inline-flex items-center gap-1 rounded-lg border border-rule bg-paper-2/60 p-1"
    role="group"
    aria-label="File view mode"
  >
    <button
      type="button"
      onClick={() => onChange('grid')}
      aria-label="Grid view"
      aria-pressed={value === 'grid'}
      className={buttonClass(value === 'grid')}
    >
      <Icon icon={LayoutGrid} className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => onChange('list')}
      aria-label="List view"
      aria-pressed={value === 'list'}
      className={buttonClass(value === 'list')}
    >
      <Icon icon={List} className="h-4 w-4" />
    </button>
  </div>
);

export default FilesViewToggle;
