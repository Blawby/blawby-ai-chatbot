import type { MatterSummary } from '@/features/matters/data/matterTypes';
import { cn } from '@/shared/utils/cn';
import { Avatar } from '@/shared/ui/profile';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { SELECTED_ACCENT_SURFACE_CLASS } from '@/shared/ui/layout/selectionStyles';
import { MatterStatusDot } from '@/features/matters/components/MatterStatusDot';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';

interface MatterListItemProps {
  matter: MatterSummary;
  onSelect?: (matter: MatterSummary) => void;
  isSelected?: boolean;
}

export const MatterListItem = ({ matter, onSelect, isSelected = false }: MatterListItemProps) => {
  const updatedLabel = formatRelativeTime(matter.updatedAt);
  const isInteractive = Boolean(onSelect);
  const statusLabel = MATTER_STATUS_LABELS[matter.status];

  const rowClassName = cn(
    'relative w-full text-left flex items-center gap-3 px-4 py-3 transition-all duration-150',
    isSelected ? SELECTED_ACCENT_SURFACE_CLASS : '',
    isInteractive ? 'hover:bg-surface-card-hover cursor-pointer' : 'cursor-default'
  );

  const content = (
    <>
      {isSelected ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-500"
        />
      ) : null}
      <div className="relative shrink-0">
        <Avatar
          name={matter.clientName}
          size="sm"
          className="bg-surface-card-raised text-ink ring-1 ring-line-subtle"
        />
        <MatterStatusDot
          status={matter.status}
          className="absolute -bottom-0.5 -right-0.5 p-0 ring-2 ring-card"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 truncate text-[14px] font-semibold leading-5 tracking-tight text-ink">
              {matter.title}
            </h2>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-dim-2">
              <span className="truncate">{matter.clientName}</span>
              <span aria-hidden="true" className="text-dim-2/30">·</span>
              <span className="truncate">{statusLabel}</span>
            </p>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-dim-2/80">
            {updatedLabel}
          </span>
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
          aria-label={`Select matter ${matter.title} for ${matter.clientName} (${statusLabel})`}
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
