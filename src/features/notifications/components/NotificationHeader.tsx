import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import type { NotificationCategory } from '@/features/notifications/types';

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  message: 'Messages',
  system: 'System',
  payment: 'Payments',
  intake: 'Intakes',
  matter: 'Matters'
};

interface NotificationHeaderProps {
  activeCategory: NotificationCategory;
  unreadByCategory: Record<NotificationCategory, number>;
  onCategoryChange: (category: NotificationCategory) => void;
  onMarkAllRead: () => void;
  className?: string;
}

export const NotificationHeader = ({
  activeCategory,
  unreadByCategory,
  onCategoryChange,
  onMarkAllRead,
  className = ''
}: NotificationHeaderProps) => {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-gray-200 dark:border-dark-border px-4 py-3', className)}>
      <div className="flex items-center gap-2 overflow-x-auto">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
          const category = key as NotificationCategory;
          const isActive = category === activeCategory;
          const hasUnread = unreadByCategory[category] > 0;
          return (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={cn(
                'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={cn(hasUnread ? 'font-semibold' : 'font-medium')}>{label}</span>
              {hasUnread && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onMarkAllRead}
        disabled={unreadByCategory[activeCategory] === 0}
      >
        Mark all read
      </Button>
    </div>
  );
};
