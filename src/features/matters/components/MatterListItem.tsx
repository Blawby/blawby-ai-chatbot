import type { MatterSummary } from '@/features/matters/data/matterTypes';
import { cn } from '@/shared/utils/cn';
import { Avatar } from '@/shared/ui/profile';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

interface MatterListItemProps {
  matter: MatterSummary;
  onSelect?: (matter: MatterSummary) => void;
  isSelected?: boolean;
}

export const MatterListItem = ({ matter, onSelect, isSelected = false }: MatterListItemProps) => {
  const updatedLabel = formatRelativeTime(matter.updatedAt);
  const isInteractive = Boolean(onSelect);

  const rowClassName = cn(
    'w-full text-left flex items-center gap-3 px-4 py-3.5 transition-colors duration-150',
    isSelected ? 'bg-surface-utility/60' : '',
    isInteractive ? 'hover:bg-surface-utility/40 cursor-pointer' : 'cursor-default'
  );

  const content = (
    <>
      <Avatar
        name={matter.clientName}
        size="sm"
        className="bg-surface-utility/40 text-input-text ring-1 ring-line-glass/20"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 truncate text-sm font-semibold leading-6 text-input-text">
              {matter.title}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-input-placeholder">
              <span className="truncate">{matter.clientName}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-input-placeholder">{updatedLabel}</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <li>
      {isInteractive ? (
        <button
          type="button"
          onClick={() => onSelect?.(matter)}
          className={cn(
            rowClassName,
            'h-auto rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50'
          )}
          aria-current={isSelected ? 'true' : undefined}
          aria-label={`Select matter ${matter.title} for ${matter.clientName} (${matter.status})`}
        >
          {content}
        </button>
      ) : (
        <div className={rowClassName}>
          {content}
        </div>
      )}
    </li>
  );
};
