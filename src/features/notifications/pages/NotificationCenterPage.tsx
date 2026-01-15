import { NotificationHeader } from '@/features/notifications/components/NotificationHeader';
import { NotificationList } from '@/features/notifications/components/NotificationList';
import { NotificationEmptyState } from '@/features/notifications/components/NotificationEmptyState';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { useNotificationCounts } from '@/features/notifications/hooks/useNotificationCounts';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { NotificationCategory } from '@/features/notifications/types';
import { useLayoutEffect } from 'preact/hooks';

interface NotificationCenterPageProps {
  category: NotificationCategory;
  onCategoryChange: (category: NotificationCategory) => void;
  className?: string;
}

export const NotificationCenterPage = ({
  category,
  onCategoryChange,
  className = ''
}: NotificationCenterPageProps) => {
  const {
    notifications,
    isLoading,
    error,
    hasMore,
    ensureLoaded,
    markRead,
    markUnread,
    markAllRead,
    loadMore
  } = useNotifications(category);
  const { unreadByCategory } = useNotificationCounts();
  const { showError, showSuccess } = useToastContext();

  useLayoutEffect(() => {
    ensureLoaded();
  }, [category, ensureLoaded]);

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      showSuccess('All caught up', 'Marked all notifications as read.');
    } catch (err) {
      showError('Update failed', err instanceof Error ? err.message : 'Unable to mark all as read.');
    }
  };

  const isEmpty = !isLoading && notifications.length === 0 && !error;

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <NotificationHeader
        activeCategory={category}
        unreadByCategory={unreadByCategory}
        onCategoryChange={onCategoryChange}
        onMarkAllRead={handleMarkAllRead}
        className="sticky top-0 z-10 bg-white dark:bg-dark-bg"
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && notifications.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {isEmpty && <NotificationEmptyState category={category} />}

        {notifications.length > 0 && (
          <NotificationList
            notifications={notifications}
            onMarkRead={markRead}
            onMarkUnread={markUnread}
          />
        )}

        {hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
