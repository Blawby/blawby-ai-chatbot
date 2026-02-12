import type { MatterSummary } from '@/features/matters/data/mockMatters';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { Avatar } from '@/shared/ui/profile';
import { MatterStatusDot } from './MatterStatusDot';
import { MatterStatusPill } from './MatterStatusPill';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

interface MatterListItemProps {
  matter: MatterSummary;
  onSelect?: (matter: MatterSummary) => void;
}

export const MatterListItem = ({ matter, onSelect }: MatterListItemProps) => {
  const updatedLabel = formatRelativeTime(matter.updatedAt);
  const isInteractive = Boolean(onSelect);

  const sharedClassName = cn(
    'w-full text-left relative flex items-center space-x-4 px-4 py-4 sm:px-6 lg:px-8 transition-colors',
    isInteractive
      ? 'hover:bg-surface-glass/60 cursor-pointer'
      : 'cursor-default'
  );

  const content = (
    <>
      <div className="min-w-0 flex-auto">
        <div className="flex items-center gap-x-3">
          <MatterStatusDot status={matter.status} className="flex-none" />
          <h2 className="min-w-0 text-sm font-semibold leading-6 text-input-text">
            <span className="flex gap-x-2">
              <span className="truncate">{matter.title}</span>
              <span className="text-input-text/60">/</span>
              <span className="flex items-center gap-x-2 whitespace-nowrap text-input-text/70">
                <Avatar
                  name={matter.clientName}
                  size="xs"
                  className="bg-surface-glass/70 text-input-text ring-1 ring-inset ring-line-glass/40"
                />
                <span>{matter.clientName}</span>
              </span>
            </span>
          </h2>
        </div>
        <div className="mt-3 flex items-center gap-x-2.5 text-xs leading-5 text-input-text/70">
          <p className="truncate">Practice Area: {matter.practiceArea || 'Not Assigned'}</p>
          <svg className="h-0.5 w-0.5 flex-none fill-line-glass/60" viewBox="0 0 2 2">
            <circle cx="1" cy="1" r="1" />
          </svg>
          <p className="whitespace-nowrap">Updated {updatedLabel}</p>
        </div>
      </div>
      <MatterStatusPill status={matter.status} className="flex-none" />
      <ChevronRightIcon aria-hidden="true" className="h-5 w-5 flex-none text-input-placeholder" />
    </>
  );

  return (
    <li>
      {isInteractive ? (
        <button
          type="button"
          onClick={() => onSelect?.(matter)}
          className={cn(
            sharedClassName,
            'h-auto rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400'
          )}
          aria-label={`Select matter ${matter.title} for ${matter.clientName} (${matter.status})`}
        >
          {content}
        </button>
      ) : (
        <div className={sharedClassName}>
          {content}
        </div>
      )}
    </li>
  );
};
