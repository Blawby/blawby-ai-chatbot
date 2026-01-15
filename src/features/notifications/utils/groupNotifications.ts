import type { NotificationItem } from '@/features/notifications/types';
import { formatFullDate } from '@/shared/utils/dateTime';

export interface NotificationGroup {
  dateKey: string;
  label: string;
  items: NotificationItem[];
}

const toLocalDayKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatDayLabel = (date: Date): string => {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return formatFullDate(date);
};

export const groupNotifications = (items: NotificationItem[]): NotificationGroup[] => {
  if (!items.length) return [];

  const sorted = [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  const groups = new Map<string, NotificationGroup>();

  sorted.forEach((item) => {
    const date = new Date(item.createdAt);
    const key = toLocalDayKey(date);
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(key, {
      dateKey: key,
      label: formatDayLabel(date),
      items: [item]
    });
  });

  return Array.from(groups.values());
};
