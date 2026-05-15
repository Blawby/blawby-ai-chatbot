import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReportScheduleService,
  computeNextDelivery,
} from '../../../../worker/services/ReportScheduleService';
import type { Env } from '../../../../worker/types';

class FakeKV {
  store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
  async delete(key: string) { this.store.delete(key); }
  async list({ prefix }: { prefix: string }) {
    const keys = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys, list_complete: true as const };
  }
}

const makeEnv = (kv: FakeKV) => ({ CHAT_SESSIONS: kv as unknown as KVNamespace } as unknown as Env);

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
  let kv: FakeKV;
  let service: ReportScheduleService;
  beforeEach(() => {
    kv = new FakeKV();
    service = new ReportScheduleService(makeEnv(kv));
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
    expect(kv.store.has(`report-schedule:p1:${created.id}`)).toBe(true);
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
