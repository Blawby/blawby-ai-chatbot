import { useMemo } from 'preact/hooks';
import {
  EllipsisVerticalIcon,
  LinkIcon,
  CheckCircleIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/shared/ui/dropdown';
import { Button } from '@/shared/ui/Button';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { cn } from '@/shared/utils/cn';
import type { NotificationItem as NotificationItemType } from '@/features/notifications/types';

interface NotificationItemProps {
  notification: NotificationItemType;
  onMarkRead: (id: string) => void | Promise<void>;
  onMarkUnread: (id: string) => void | Promise<void>;
}

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
};

const isSafeUrl = (url: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const NotificationItem = ({ notification, onMarkRead, onMarkUnread }: NotificationItemProps) => {
  const { showSuccess, showError } = useToastContext();
  const isRead = Boolean(notification.readAt);
  const senderName = notification.category === 'system'
    ? 'Blawby'
    : (notification.senderName ?? 'Blawby');
  const senderAvatar = notification.category === 'system'
    ? '/blawby-favicon-iframe.png'
    : (notification.senderAvatarUrl ?? null);

  const timeLabel = useMemo(() => formatTime(notification.createdAt), [notification.createdAt]);

  const handleCopyLink = async () => {
    if (!notification.link) return;
    if (!isSafeUrl(notification.link)) {
      showError('Invalid link', 'This notification link is not safe to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(notification.link);
      showSuccess('Link copied', 'Notification link copied to clipboard.');
    } catch (error) {
      showError('Copy failed', error instanceof Error ? error.message : 'Unable to copy link');
    }
  };

  const handleOpenLink = () => {
    if (!notification.link || !isSafeUrl(notification.link)) return;
    window.location.assign(notification.link);
  };

  const handleToggleRead = async () => {
    try {
      if (isRead) {
        await onMarkUnread(notification.id);
      } else {
        await onMarkRead(notification.id);
      }
    } catch (error) {
      showError('Update failed', error instanceof Error ? error.message : 'Unable to update notification.');
    }
  };

  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border px-4 py-3 transition-colors',
        isRead
          ? 'border-gray-200 bg-white dark:border-dark-border dark:bg-dark-card-bg'
          : 'border-accent-200 bg-accent-50/40 dark:border-accent-700/40 dark:bg-dark-card-bg'
      )}
    >
      <Avatar
        src={senderAvatar}
        name={senderName}
        size="md"
        className={cn(!isRead && 'ring-2 ring-accent-400/70 ring-offset-2 ring-offset-white dark:ring-offset-dark-bg')}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className={cn('truncate', !isRead && 'font-semibold text-gray-700 dark:text-gray-200')}>
                {senderName}
              </span>
              {timeLabel && <span aria-hidden="true">•</span>}
              {timeLabel && <span>{timeLabel}</span>}
            </div>
            <h4 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {notification.title}
            </h4>
            {notification.body && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {notification.body}
              </p>
            )}
            {notification.link && (
              <button
                type="button"
                onClick={handleOpenLink}
                className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-300 dark:hover:text-accent-200"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Open link
              </button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="icon"
                size="sm"
                aria-label="Notification actions"
                className="h-9 w-9"
                icon={<EllipsisVerticalIcon className="h-4 w-4" />}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  void handleToggleRead();
                }}
              >
                <span className="flex items-center gap-2">
                  {isRead ? <EnvelopeIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
                  {isRead ? 'Mark as unread' : 'Mark as read'}
                </span>
              </DropdownMenuItem>
              {notification.link && (
                <DropdownMenuItem
                  onSelect={() => {
                    void handleCopyLink();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Copy link
                  </span>
                </DropdownMenuItem>
              )}
              {notification.link && (
                <DropdownMenuItem onSelect={handleOpenLink}>
                  <span className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Open link
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
