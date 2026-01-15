import { groupNotifications } from '@/features/notifications/utils/groupNotifications';
import type { NotificationItem as NotificationItemType } from '@/features/notifications/types';
import { NotificationItem } from './NotificationItem';

interface NotificationListProps {
  notifications: NotificationItemType[];
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
}

export const NotificationList = ({ notifications, onMarkRead, onMarkUnread }: NotificationListProps) => {
  const groups = groupNotifications(notifications);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.dateKey} className="flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {group.label}
          </div>
          <div className="flex flex-col gap-3">
            {group.items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkRead}
                onMarkUnread={onMarkUnread}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
