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
    isSelected ? 'bg-white/5' : '',
    isInteractive ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'
  );

  const content = (
    <>
      <Avatar
        name={matter.clientName}
        size="sm"
        className="bg-white/10 text-input-text ring-1 ring-white/20"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 truncate text-sm font-semibold leading-6 text-input-text">
            {matter.title}
          </h2>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-input-placeholder">
          <span className="truncate">{matter.clientName}</span>
          <svg className="h-0.5 w-0.5 flex-none fill-line-glass/60" viewBox="0 0 2 2" aria-hidden="true">
            <circle cx="1" cy="1" r="1" />
          </svg>
          <span className="whitespace-nowrap">Updated {updatedLabel}</span>
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
