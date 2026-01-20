export type NotificationCategory = 'message' | 'system' | 'payment' | 'intake' | 'matter';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  userId: string;
  practiceId?: string | null;
  category: NotificationCategory;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
  body?: string | null;
  link?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  severity?: NotificationSeverity | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  readAt?: string | null;
}

export interface NotificationListResult {
  items: NotificationItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface NotificationStreamEvent {
  notification_id: string;
  category: NotificationCategory;
  created_at: string;
  title: string;
  body?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}
