import type { Env, NotificationCategory, NotificationSeverity } from '../types.js';

export interface NotificationRecord {
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

export interface NotificationInsert {
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
  dedupeKey?: string | null;
  createdAt?: string;
}

export interface NotificationListResult {
  items: NotificationRecord[];
  nextCursor?: string;
  hasMore: boolean;
}

const MAX_LIMIT = 50;

function encodeCursor(payload: { createdAt: string; id: string }): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const padding = '='.repeat((4 - cursor.length % 4) % 4);
  const base64 = (cursor + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json) as { createdAt?: string; id?: string };
  if (!parsed.createdAt || !parsed.id) {
    throw new Error('Invalid cursor');
  }
  return { createdAt: String(parsed.createdAt), id: String(parsed.id) };
}

function coerceLimit(rawLimit?: string | null): number {
  if (!rawLimit) return 25;
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeCategory(category?: string | null): NotificationCategory | null {
  if (!category) return null;
  const normalized = category.trim().toLowerCase();
  const allowed: NotificationCategory[] = ['message', 'payment', 'intake', 'matter', 'system'];
  return allowed.includes(normalized as NotificationCategory) ? (normalized as NotificationCategory) : null;
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class NotificationStore {
  constructor(private env: Env) {}

  async createNotification(input: NotificationInsert): Promise<{ id: string; inserted: boolean; createdAt: string }> {
    const id = crypto.randomUUID();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    const dedupeKey = input.dedupeKey ?? null;

    const result = await this.env.DB.prepare(
      `INSERT OR IGNORE INTO notifications (
        id, user_id, practice_id, category, entity_type, entity_id, title, body, link,
        sender_name, sender_avatar_url, severity, metadata, dedupe_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      input.userId,
      input.practiceId ?? null,
      input.category,
      input.entityType ?? null,
      input.entityId ?? null,
      input.title,
      input.body ?? null,
      input.link ?? null,
      input.senderName ?? null,
      input.senderAvatarUrl ?? null,
      input.severity ?? null,
      metadata,
      dedupeKey,
      createdAt
    ).run();

    return {
      id,
      inserted: result.success && result.meta.changes > 0,
      createdAt
    };
  }

  async listNotifications(options: {
    userId: string;
    category?: string | null;
    limit?: string | null;
    cursor?: string | null;
    unreadOnly?: boolean;
  }): Promise<NotificationListResult> {
    const limit = coerceLimit(options.limit);
    const category = normalizeCategory(options.category);

    let cursorData: { createdAt: string; id: string } | null = null;
    if (options.cursor) {
      cursorData = decodeCursor(options.cursor);
    }

    const filters: string[] = ['user_id = ?'];
    const bindings: unknown[] = [options.userId];

    if (category) {
      filters.push('category = ?');
      bindings.push(category);
    }

    if (options.unreadOnly) {
      filters.push('read_at IS NULL');
    }

    if (cursorData) {
      filters.push('(created_at < ? OR (created_at = ? AND id < ?))');
      bindings.push(cursorData.createdAt, cursorData.createdAt, cursorData.id);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const rows = await this.env.DB.prepare(
      `SELECT id, user_id, practice_id, category, entity_type, entity_id, title, body, link,
              sender_name, sender_avatar_url, severity, metadata, created_at, read_at
         FROM notifications
         ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
    ).bind(...bindings, limit + 1).all();

    const rawItems = rows.results as Record<string, unknown>[];
    const hasMore = rawItems.length > limit;
    const items = rawItems.slice(0, limit).map((row) => this.parseRecord(row));
    const last = items[items.length - 1];

    return {
      items,
      hasMore,
      nextCursor: hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : undefined
    };
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const readAt = new Date().toISOString();
    const result = await this.env.DB.prepare(
      `UPDATE notifications
          SET read_at = ?
        WHERE id = ? AND user_id = ? AND read_at IS NULL`
    ).bind(readAt, notificationId, userId).run();

    return result.success && result.meta.changes > 0;
  }

  async markAllRead(userId: string, category?: string | null): Promise<number> {
    const readAt = new Date().toISOString();
    const normalizedCategory = normalizeCategory(category);

    const result = normalizedCategory
      ? await this.env.DB.prepare(
        `UPDATE notifications
            SET read_at = ?
          WHERE user_id = ? AND category = ? AND read_at IS NULL`
      ).bind(readAt, userId, normalizedCategory).run()
      : await this.env.DB.prepare(
        `UPDATE notifications
            SET read_at = ?
          WHERE user_id = ? AND read_at IS NULL`
      ).bind(readAt, userId).run();

    return result.success ? result.meta.changes : 0;
  }

  async getUnreadCount(userId: string, category?: string | null): Promise<number> {
    const normalizedCategory = normalizeCategory(category);
    const row = normalizedCategory
      ? await this.env.DB.prepare(
        `SELECT COUNT(*) as count
           FROM notifications
          WHERE user_id = ? AND category = ? AND read_at IS NULL`
      ).bind(userId, normalizedCategory).first<{ count?: number }>()
      : await this.env.DB.prepare(
        `SELECT COUNT(*) as count
           FROM notifications
          WHERE user_id = ? AND read_at IS NULL`
      ).bind(userId).first<{ count?: number }>();

    return Number(row?.count ?? 0);
  }

  private parseRecord(row: Record<string, unknown>): NotificationRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      practiceId: row.practice_id ? String(row.practice_id) : null,
      category: String(row.category) as NotificationCategory,
      entityType: row.entity_type ? String(row.entity_type) : null,
      entityId: row.entity_id ? String(row.entity_id) : null,
      title: String(row.title),
      body: row.body ? String(row.body) : null,
      link: row.link ? String(row.link) : null,
      senderName: row.sender_name ? String(row.sender_name) : null,
      senderAvatarUrl: row.sender_avatar_url ? String(row.sender_avatar_url) : null,
      severity: row.severity ? (String(row.severity) as NotificationSeverity) : null,
      metadata: parseMetadata(row.metadata ? String(row.metadata) : null),
      createdAt: String(row.created_at),
      readAt: row.read_at ? String(row.read_at) : null
    };
  }
}
