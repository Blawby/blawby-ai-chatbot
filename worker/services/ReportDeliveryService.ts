/**
 * Persists report deliveries in D1, stores the CSV bytes in R2, and
 * enqueues an in-app notification. Reads downstream by the deliveries
 * list/detail UI.
 *
 * R2 key shape: `report-exports/{practiceId}/{deliveryId}/{reportType}.csv`
 * D1 table:    `report_deliveries` (see migration 20260514).
 */

import type { Env, NotificationQueueMessage } from '../types.js';
import { enqueueNotification } from './NotificationPublisher.js';

export type ReportDeliveryStatus = 'pending' | 'completed' | 'failed';

export interface ReportDelivery {
  id: string;
  practiceId: string;
  reportType: string;
  filters: Record<string, string>;
  recipients: string[];
  status: ReportDeliveryStatus;
  storageKey?: string;
  byteSize?: number;
  errorMessage?: string;
  createdBy: string;
  createdAt: string;
  scheduledFor?: string;
  completedAt?: string;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const buildStorageKey = (practiceId: string, deliveryId: string, reportType: string) =>
  `report-exports/${practiceId}/${deliveryId}/${reportType}.csv`;

const rowToDelivery = (row: Record<string, unknown>): ReportDelivery => ({
  id: String(row.id),
  practiceId: String(row.practice_id),
  reportType: String(row.report_type),
  filters: row.filters_json ? safeJsonParse(String(row.filters_json), {} as Record<string, string>) : {},
  recipients: row.recipients_json ? safeJsonParse(String(row.recipients_json), [] as string[]) : [],
  status: (row.status as ReportDeliveryStatus) ?? 'pending',
  storageKey: row.storage_key ? String(row.storage_key) : undefined,
  byteSize: typeof row.byte_size === 'number' ? row.byte_size : undefined,
  errorMessage: row.error_message ? String(row.error_message) : undefined,
  createdBy: String(row.created_by),
  createdAt: String(row.created_at),
  scheduledFor: row.scheduled_for ? String(row.scheduled_for) : undefined,
  completedAt: row.completed_at ? String(row.completed_at) : undefined,
});

function safeJsonParse<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export class ReportDeliveryService {
  constructor(private readonly env: Env) {}

  async create(input: {
    practiceId: string;
    reportType: string;
    filters: Record<string, string>;
    recipients: string[];
    createdBy: string;
    scheduledFor?: string;
  }): Promise<ReportDelivery> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await this.env.DB.prepare(`
      INSERT INTO report_deliveries
        (id, practice_id, report_type, filters_json, recipients_json, status, created_by, created_at, scheduled_for)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      id,
      input.practiceId,
      input.reportType,
      JSON.stringify(input.filters),
      JSON.stringify(input.recipients),
      input.createdBy,
      createdAt,
      input.scheduledFor ?? null,
    ).run();

    return {
      id,
      practiceId: input.practiceId,
      reportType: input.reportType,
      filters: input.filters,
      recipients: input.recipients,
      status: 'pending',
      createdBy: input.createdBy,
      createdAt,
      scheduledFor: input.scheduledFor,
    };
  }

  async storeCsv(
    practiceId: string,
    deliveryId: string,
    reportType: string,
    body: string
  ): Promise<{ storageKey: string; byteSize: number }> {
    if (!this.env.FILES_BUCKET) {
      throw new Error('FILES_BUCKET binding not configured');
    }
    const key = buildStorageKey(practiceId, deliveryId, reportType);
    const bytes = new TextEncoder().encode(body);
    await this.env.FILES_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: 'text/csv; charset=utf-8' },
    });
    return { storageKey: key, byteSize: bytes.byteLength };
  }

  async markCompleted(
    deliveryId: string,
    update: { storageKey: string; byteSize: number }
  ): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE report_deliveries
      SET status = 'completed',
          storage_key = ?,
          byte_size = ?,
          completed_at = ?
      WHERE id = ?
    `).bind(
      update.storageKey,
      update.byteSize,
      new Date().toISOString(),
      deliveryId,
    ).run();
  }

  async markFailed(deliveryId: string, errorMessage: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE report_deliveries
      SET status = 'failed',
          error_message = ?,
          completed_at = ?
      WHERE id = ?
    `).bind(
      errorMessage,
      new Date().toISOString(),
      deliveryId,
    ).run();
  }

  async list(
    practiceId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{ items: ReportDelivery[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const cursor = options.cursor ?? null;
    const query = cursor
      ? `SELECT * FROM report_deliveries
         WHERE practice_id = ? AND created_at < ?
         ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM report_deliveries
         WHERE practice_id = ?
         ORDER BY created_at DESC LIMIT ?`;
    const stmt = cursor
      ? this.env.DB.prepare(query).bind(practiceId, cursor, limit + 1)
      : this.env.DB.prepare(query).bind(practiceId, limit + 1);
    const result = await stmt.all<Record<string, unknown>>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items = slice.map(rowToDelivery);
    const nextCursor = hasMore && slice.length > 0
      ? String(slice[slice.length - 1].created_at)
      : null;
    return { items, nextCursor };
  }

  async get(practiceId: string, deliveryId: string): Promise<ReportDelivery | null> {
    const row = await this.env.DB.prepare(`
      SELECT * FROM report_deliveries WHERE practice_id = ? AND id = ?
    `).bind(practiceId, deliveryId).first<Record<string, unknown>>();
    return row ? rowToDelivery(row) : null;
  }

  async downloadBody(delivery: ReportDelivery): Promise<{ body: ReadableStream | null; contentType: string; size: number | null }> {
    if (!delivery.storageKey || !this.env.FILES_BUCKET) {
      return { body: null, contentType: 'text/csv; charset=utf-8', size: null };
    }
    const obj = await this.env.FILES_BUCKET.get(delivery.storageKey);
    if (!obj) return { body: null, contentType: 'text/csv; charset=utf-8', size: null };
    return {
      body: obj.body as unknown as ReadableStream,
      contentType: obj.httpMetadata?.contentType ?? 'text/csv; charset=utf-8',
      size: typeof obj.size === 'number' ? obj.size : null,
    };
  }

  async notifyRecipients(input: {
    practiceId: string;
    delivery: ReportDelivery;
    practiceSlug: string | null;
  }): Promise<void> {
    const link = input.practiceSlug
      ? `/practice/${encodeURIComponent(input.practiceSlug)}/reports/deliveries/${input.delivery.id}`
      : `/reports/deliveries/${input.delivery.id}`;
    const message: NotificationQueueMessage = {
      eventId: crypto.randomUUID(),
      practiceId: input.practiceId,
      category: 'system',
      entityType: 'report_delivery',
      entityId: input.delivery.id,
      title: `Report ready: ${input.delivery.reportType}`,
      body: 'Your report is ready to download.',
      link,
      severity: 'info',
      recipients: input.delivery.recipients.map((userId) => ({
        userId,
        email: null,
        preferences: {
          pushEnabled: true,
          emailEnabled: true,
          desktopPushEnabled: true,
          mentionsOnly: false,
          inAppEnabled: true,
          inAppFrequency: 'all',
        },
      })),
      createdAt: new Date().toISOString(),
    };
    await enqueueNotification(this.env, message);
  }
}
