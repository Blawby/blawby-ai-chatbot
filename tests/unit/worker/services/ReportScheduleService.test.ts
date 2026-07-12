import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReportScheduleService,
  computeNextDelivery,
} from '../../../../worker/services/ReportScheduleService';
import type { Env } from '../../../../worker/types';

type StoredRow = Record<string, string | number | null>;

class FakeD1 {
  rows = new Map<string, StoredRow>();

  prepare(query: string) {
    let args: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        args = values;
        return statement;
      },
      all: async <T>() => ({
        results: [...this.rows.values()]
          .filter((row) => row.practice_id === args[0])
          .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))) as T[],
        success: true,
        meta: {},
      }),
      first: async <T>() =>
        ([...this.rows.values()].find((row) => row.practice_id === args[0] && row.id === args[1]) ?? null) as T | null,
      run: async () => {
        if (query.startsWith('INSERT')) {
          const [
            report_type,
            frequency,
            day_of_week,
            day_of_month,
            hour_utc,
            recipients_json,
            filters_json,
            active,
            updated_at,
            next_delivery_at,
            id,
            practice_id,
            created_at,
          ] = args;
          this.rows.set(String(id), {
            id: String(id),
            practice_id: String(practice_id),
            report_type: String(report_type),
            frequency: String(frequency),
            day_of_week: day_of_week as number | null,
            day_of_month: day_of_month as number | null,
            hour_utc: hour_utc as number,
            recipients_json: String(recipients_json),
            filters_json: String(filters_json),
            active: active as number,
            created_at: String(created_at),
            updated_at: String(updated_at),
            next_delivery_at: next_delivery_at as string | null,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE')) {
          const id = String(args[10]);
          const practiceId = String(args[11]);
          const row = this.rows.get(id);
          if (!row || row.practice_id !== practiceId) return { success: true, meta: { changes: 0 } };
          const keys = [
            'report_type',
            'frequency',
            'day_of_week',
            'day_of_month',
            'hour_utc',
            'recipients_json',
            'filters_json',
            'active',
            'updated_at',
            'next_delivery_at',
          ];
          keys.forEach((key, index) => {
            row[key] = args[index] as string | number | null;
          });
          return { success: true, meta: { changes: 1 } };
        }
        const practiceId = String(args[0]);
        const id = String(args[1]);
        const row = this.rows.get(id);
        const deleted = row?.practice_id === practiceId;
        if (deleted) this.rows.delete(id);
        return { success: true, meta: { changes: deleted ? 1 : 0 } };
      },
    };
    return statement;
  }
}

const makeEnv = (db: FakeD1) => ({ DB: db as unknown as D1Database }) as Env;

describe('computeNextDelivery', () => {
  it('rolls daily forward to next-day occurrence if same-day hour has passed', () => {
    const from = new Date('2026-05-14T12:00:00Z');
    const iso = computeNextDelivery('daily', 8, { from });
    expect(iso).toBe('2026-05-15T08:00:00.000Z');
  });

  it('keeps daily today if hour is in the future', () => {
    const from = new Date('2026-05-14T06:00:00Z');
    const iso = computeNextDelivery('daily', 8, { from });
    expect(iso).toBe('2026-05-14T08:00:00.000Z');
  });

  it('targets the configured day of week (Mon=1) for weekly', () => {
    const from = new Date('2026-05-14T12:00:00Z'); // Thursday
    const iso = computeNextDelivery('weekly', 9, { dayOfWeek: 1, from });
    // Next Monday from Thu = May 18
    expect(iso).toBe('2026-05-18T09:00:00.000Z');
  });

  it('rejects invalid weekly day of week values', () => {
    const from = new Date('2026-05-14T12:00:00Z');
    expect(() => computeNextDelivery('weekly', 9, { dayOfWeek: 7, from }))
      .toThrow('dayOfWeek must be an integer from 0-6');
  });

  it('targets the configured day of month for monthly', () => {
    const from = new Date('2026-05-14T12:00:00Z');
    const iso = computeNextDelivery('monthly', 9, { dayOfMonth: 5, from });
    // Today (14) > 5, roll to next month
    expect(iso.startsWith('2026-06-05')).toBe(true);
  });

  it('clamps day of month to 28 to avoid Feb edge cases', () => {
    const from = new Date('2026-05-14T12:00:00Z');
    const iso = computeNextDelivery('monthly', 9, { dayOfMonth: 31, from });
    expect(iso.endsWith('-28T09:00:00.000Z')).toBe(true);
  });
});

describe('ReportScheduleService', () => {
  let db: FakeD1;
  let service: ReportScheduleService;
  beforeEach(() => {
    db = new FakeD1();
    service = new ReportScheduleService(makeEnv(db));
  });

  it('create -> get round-trip works and key is scoped to practice', async () => {
    const created = await service.create('p1', {
      reportType: 'revenue',
      frequency: 'weekly',
      hourUtc: 9,
      dayOfWeek: 1,
      recipients: ['u1'],
      filters: { period: 'month' },
    });
    expect(created.practiceId).toBe('p1');
    expect(created.id).toBeTruthy();
    expect(db.rows.get(created.id)?.practice_id).toBe('p1');
    const got = await service.get('p1', created.id);
    expect(got?.recipients).toEqual(['u1']);
  });

  it('list returns only schedules for the requested practice', async () => {
    await service.create('p1', { reportType: 'revenue', frequency: 'daily', hourUtc: 9, recipients: [], filters: {} });
    await service.create('p2', { reportType: 'aging', frequency: 'daily', hourUtc: 9, recipients: [], filters: {} });
    const p1 = await service.list('p1');
    const p2 = await service.list('p2');
    expect(p1).toHaveLength(1);
    expect(p2).toHaveLength(1);
    expect(p1[0].reportType).toBe('revenue');
  });

  it('update merges patch and recomputes nextDeliveryAt', async () => {
    const created = await service.create('p1', {
      reportType: 'revenue', frequency: 'daily', hourUtc: 9, recipients: [], filters: {},
    });
    const updated = await service.update('p1', created.id, { hourUtc: 14, recipients: ['u1', 'u2'] });
    expect(updated?.hourUtc).toBe(14);
    expect(updated?.recipients).toEqual(['u1', 'u2']);
    expect(updated?.nextDeliveryAt).toMatch(/T14:00:00/);
  });

  it('delete removes the row and returns false on missing id', async () => {
    const created = await service.create('p1', {
      reportType: 'revenue', frequency: 'daily', hourUtc: 9, recipients: [], filters: {},
    });
    expect(await service.delete('p1', created.id)).toBe(true);
    expect(await service.get('p1', created.id)).toBeNull();
    expect(await service.delete('p1', 'missing')).toBe(false);
  });
});
