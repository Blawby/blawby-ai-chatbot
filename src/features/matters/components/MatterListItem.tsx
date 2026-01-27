import type { MatterSummary } from '@/features/matters/data/mockMatters';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { Avatar } from '@/shared/ui/profile';
import { Button } from '@/shared/ui/Button';
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
      ? 'hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer'
      : 'cursor-default'
  );

  const content = (
    <>
      <div className="min-w-0 flex-auto">
        <div className="flex items-center gap-x-3">
          <MatterStatusDot status={matter.status} className="flex-none" />
          <h2 className="min-w-0 text-sm font-semibold leading-6 text-gray-900 dark:text-white">
            <span className="flex gap-x-2">
              <span className="truncate">{matter.title}</span>
              <span className="text-gray-400">/</span>
              <span className="flex items-center gap-x-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                <Avatar
                  name={matter.clientName}
                  size="xs"
                  className="bg-gray-200 text-gray-700 dark:bg-gray-700"
                />
                <span>{matter.clientName}</span>
              </span>
            </span>
          </h2>
        </div>
        <div className="mt-3 flex items-center gap-x-2.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
          <p className="truncate">Practice Area: {matter.practiceArea || 'Not Assigned'}</p>
          <svg className="h-0.5 w-0.5 flex-none fill-gray-300 dark:fill-white/30" viewBox="0 0 2 2">
            <circle cx="1" cy="1" r="1" />
          </svg>
          <p className="whitespace-nowrap">Updated {updatedLabel}</p>
        </div>
      </div>
      <MatterStatusPill status={matter.status} className="flex-none" />
      <ChevronRightIcon aria-hidden="true" className="h-5 w-5 flex-none text-gray-400" />
    </>
  );

  return (
    <li>
      {isInteractive ? (
        <Button
          variant="ghost"
          onClick={() => onSelect?.(matter)}
          className={cn(sharedClassName, 'w-full h-auto')}
          aria-label={`Select matter ${matter.title} for ${matter.clientName} (${matter.status})`}
        >
          {content}
        </Button>
      ) : (
        <div className={sharedClassName}>
          {content}
        </div>
      )}
    </li>
  );
};
