/**
 * KV-backed CRUD for report schedules. Keys live under
 * `report-schedule:${practiceId}:${id}`.
 *
 * `computeNextDelivery` is exported separately so unit tests can exercise
 * the cron math without the KV layer.
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

const KEY_PREFIX = 'report-schedule:';

const buildKey = (practiceId: string, scheduleId: string) =>
  `${KEY_PREFIX}${practiceId}:${scheduleId}`;

const listPrefix = (practiceId: string) => `${KEY_PREFIX}${practiceId}:`;

export const computeNextDelivery = (
  frequency: ReportFrequency,
  hourUtc: number,
  options: { dayOfWeek?: number; dayOfMonth?: number; from?: Date } = {}
): string => {
  const from = options.from ?? new Date();
  const candidate = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    hourUtc,
    0,
    0,
    0
  ));
  if (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 1);

  if (frequency === 'daily') {
    return candidate.toISOString();
  }
  if (frequency === 'weekly') {
    const target = options.dayOfWeek ?? 1; // Monday default
    while (candidate.getUTCDay() !== target) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate.toISOString();
  }
  // monthly
  const targetDay = Math.max(1, Math.min(28, options.dayOfMonth ?? 1));
  if (candidate.getUTCDate() > targetDay) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }
  candidate.setUTCDate(targetDay);
  return candidate.toISOString();
};

export class ReportScheduleService {
  constructor(private readonly env: Env) {}

  async list(practiceId: string): Promise<ReportSchedule[]> {
    const prefix = listPrefix(practiceId);
    const out: ReportSchedule[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.env.CHAT_SESSIONS.list({ prefix, cursor });
      for (const key of page.keys) {
        const raw = await this.env.CHAT_SESSIONS.get(key.name);
        if (!raw) continue;
        try {
          out.push(JSON.parse(raw) as ReportSchedule);
        } catch {
          /* skip corrupt rows */
        }
      }
      cursor = page.list_complete
        ? undefined
        : (page as { cursor?: string }).cursor;
    } while (cursor);
    return out;
  }

  async get(practiceId: string, scheduleId: string): Promise<ReportSchedule | null> {
    const raw = await this.env.CHAT_SESSIONS.get(buildKey(practiceId, scheduleId));
    if (!raw) return null;
    try { return JSON.parse(raw) as ReportSchedule; } catch { return null; }
  }

  async create(
    practiceId: string,
    input: Omit<ReportSchedule, 'id' | 'practiceId' | 'createdAt' | 'updatedAt' | 'nextDeliveryAt' | 'active'> & { active?: boolean }
  ): Promise<ReportSchedule> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: ReportSchedule = {
      id,
      practiceId,
      reportType: input.reportType,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      hourUtc: input.hourUtc,
      recipients: input.recipients,
      filters: input.filters,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
      nextDeliveryAt: computeNextDelivery(input.frequency, input.hourUtc, {
        dayOfWeek: input.dayOfWeek,
        dayOfMonth: input.dayOfMonth,
      }),
    };
    await this.env.CHAT_SESSIONS.put(buildKey(practiceId, id), JSON.stringify(record));
    return record;
  }

  async update(
    practiceId: string,
    scheduleId: string,
    patch: Partial<Omit<ReportSchedule, 'id' | 'practiceId' | 'createdAt'>>
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
    merged.nextDeliveryAt = computeNextDelivery(merged.frequency, merged.hourUtc, {
      dayOfWeek: merged.dayOfWeek,
      dayOfMonth: merged.dayOfMonth,
    });
    await this.env.CHAT_SESSIONS.put(buildKey(practiceId, scheduleId), JSON.stringify(merged));
    return merged;
  }

  async delete(practiceId: string, scheduleId: string): Promise<boolean> {
    const existing = await this.get(practiceId, scheduleId);
    if (!existing) return false;
    await this.env.CHAT_SESSIONS.delete(buildKey(practiceId, scheduleId));
    return true;
  }
}
