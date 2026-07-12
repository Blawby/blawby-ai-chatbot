/**
 * D1-backed CRUD for durable report schedules.
 *
 * KV is reserved for rebuildable cache/session state. A report schedule is a
 * user-authored instruction and must recover with the rest of the practice's
 * durable records.
 */

import type { Env } from '../types.js';

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';

export interface ReportSchedule {
  id: string;
  practiceId: string;
  reportType: string;
  frequency: ReportFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourUtc: number;
  recipients: string[];
  filters: Record<string, string>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nextDeliveryAt?: string;
}

interface ReportScheduleRow {
  id: string;
  practice_id: string;
  report_type: string;
  frequency: ReportFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  hour_utc: number;
  recipients_json: string;
  filters_json: string;
  active: number;
  created_at: string;
  updated_at: string;
  next_delivery_at: string | null;
}

const requireDayOfWeek = (value: number | undefined): number => {
  const target = value ?? 1;
  if (!Number.isInteger(target) || target < 0 || target > 6) {
    throw new Error('dayOfWeek must be an integer from 0-6');
  }
  return target;
};

const parseRecipients = (raw: string): string[] => {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Stored report schedule recipients are malformed');
  }
  return value;
};

const parseFilters = (raw: string): Record<string, string> => {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored report schedule filters are malformed');
  }
  if (!Object.values(value).every((item) => typeof item === 'string')) {
    throw new Error('Stored report schedule filters are malformed');
  }
  return value as Record<string, string>;
};

const fromRow = (row: ReportScheduleRow): ReportSchedule => ({
  id: row.id,
  practiceId: row.practice_id,
  reportType: row.report_type,
  frequency: row.frequency,
  dayOfWeek: row.day_of_week ?? undefined,
  dayOfMonth: row.day_of_month ?? undefined,
  hourUtc: row.hour_utc,
  recipients: parseRecipients(row.recipients_json),
  filters: parseFilters(row.filters_json),
  active: row.active === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  nextDeliveryAt: row.next_delivery_at ?? undefined,
});

export const computeNextDelivery = (
  frequency: ReportFrequency,
  hourUtc: number,
  options: { dayOfWeek?: number; dayOfMonth?: number; from?: Date } = {},
): string => {
  const from = options.from ?? new Date();
  const candidate = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hourUtc, 0, 0, 0),
  );
  if (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 1);

  if (frequency === 'daily') return candidate.toISOString();
  if (frequency === 'weekly') {
    const target = requireDayOfWeek(options.dayOfWeek);
    while (candidate.getUTCDay() !== target) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate.toISOString();
  }
  const targetDay = Math.max(1, Math.min(28, options.dayOfMonth ?? 1));
  if (candidate.getUTCDate() > targetDay) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  candidate.setUTCDate(targetDay);
  return candidate.toISOString();
};

export class ReportScheduleService {
  constructor(private readonly env: Env) {}

  async list(practiceId: string): Promise<ReportSchedule[]> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM report_schedules WHERE practice_id = ? ORDER BY created_at ASC, id ASC',
    )
      .bind(practiceId)
      .all<ReportScheduleRow>();
    return result.results.map(fromRow);
  }

  async get(practiceId: string, scheduleId: string): Promise<ReportSchedule | null> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM report_schedules WHERE practice_id = ? AND id = ? LIMIT 1',
    )
      .bind(practiceId, scheduleId)
      .first<ReportScheduleRow>();
    return row ? fromRow(row) : null;
  }

  async create(
    practiceId: string,
    input: Omit<ReportSchedule, 'id' | 'practiceId' | 'createdAt' | 'updatedAt' | 'nextDeliveryAt' | 'active'> & {
      active?: boolean;
    },
  ): Promise<ReportSchedule> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: ReportSchedule = {
      ...input,
      id,
      practiceId,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
      nextDeliveryAt: computeNextDelivery(input.frequency, input.hourUtc, input),
    };
    await this.persist(record, 'INSERT');
    return record;
  }

  async update(
    practiceId: string,
    scheduleId: string,
    patch: Partial<Omit<ReportSchedule, 'id' | 'practiceId' | 'createdAt'>>,
  ): Promise<ReportSchedule | null> {
    const existing = await this.get(practiceId, scheduleId);
    if (!existing) return null;
    const merged: ReportSchedule = {
      ...existing,
      ...patch,
      id: existing.id,
      practiceId: existing.practiceId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    merged.nextDeliveryAt = computeNextDelivery(merged.frequency, merged.hourUtc, merged);
    await this.persist(merged, 'UPDATE');
    return merged;
  }

  async delete(practiceId: string, scheduleId: string): Promise<boolean> {
    const result = await this.env.DB.prepare('DELETE FROM report_schedules WHERE practice_id = ? AND id = ?')
      .bind(practiceId, scheduleId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  private async persist(record: ReportSchedule, operation: 'INSERT' | 'UPDATE'): Promise<void> {
    const values = [
      record.reportType,
      record.frequency,
      record.dayOfWeek ?? null,
      record.dayOfMonth ?? null,
      record.hourUtc,
      JSON.stringify(record.recipients),
      JSON.stringify(record.filters),
      record.active ? 1 : 0,
      record.updatedAt,
      record.nextDeliveryAt ?? null,
    ];
    if (operation === 'INSERT') {
      await this.env.DB.prepare(
        `INSERT INTO report_schedules (
          report_type, frequency, day_of_week, day_of_month, hour_utc,
          recipients_json, filters_json, active, updated_at, next_delivery_at,
          id, practice_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(...values, record.id, record.practiceId, record.createdAt)
        .run();
      return;
    }
    await this.env.DB.prepare(
      `UPDATE report_schedules SET
        report_type = ?, frequency = ?, day_of_week = ?, day_of_month = ?, hour_utc = ?,
        recipients_json = ?, filters_json = ?, active = ?, updated_at = ?, next_delivery_at = ?
       WHERE id = ? AND practice_id = ?`,
    )
      .bind(...values, record.id, record.practiceId)
      .run();
  }
}
