/**
 * Pure-function aggregation tests for ReportService. The class itself
 * touches Railway, but its helpers (groupRevenue / bucketAging /
 * computeProfitability / groupUtilizationByUser / pLimit /
 * resolveDateRange / sumBillableHours) are testable in isolation.
 */
import { describe, it, expect } from 'vitest';
import {
  groupRevenue,
  bucketAging,
  computeProfitability,
  groupUtilizationByUser,
  resolveDateRange,
  sumBillableHours,
  pLimit,
} from '../../../../worker/services/ReportService';
import type { BackendInvoice } from '../../../../worker/types/wire/invoice';
import type {
  BackendMatter,
  BackendMatterTimeEntry,
} from '../../../../worker/types/wire/matter';
import { asMajor } from '../../../../src/shared/utils/money';

const invoice = (overrides: Partial<BackendInvoice>): BackendInvoice => ({
  id: overrides.id ?? `inv_${Math.random()}`,
  organization_id: 'p1',
  client_id: 'c1',
  connected_account_id: 'acc1',
  amount_paid: 0,
  amount_due: 0,
  status: 'open',
  ...overrides,
} as BackendInvoice);

const matter = (overrides: Partial<BackendMatter>): BackendMatter => ({
  id: overrides.id ?? `m_${Math.random()}`,
  ...overrides,
} as BackendMatter);

const timeEntry = (overrides: Partial<BackendMatterTimeEntry>): BackendMatterTimeEntry => ({
  id: overrides.id ?? `t_${Math.random()}`,
  matter_id: overrides.matter_id ?? 'm1',
  ...overrides,
} as BackendMatterTimeEntry);

describe('resolveDateRange', () => {
  it('returns explicit range when both start and end provided', () => {
    const r = resolveDateRange('2026-01-01T00:00:00Z', '2026-03-31T00:00:00Z', 'month');
    expect(r.startIso).toBe('2026-01-01T00:00:00.000Z');
    expect(r.endIso).toBe('2026-03-31T00:00:00.000Z');
  });

  it('falls back to last 12 months when period=month and no start/end', () => {
    const now = new Date('2026-05-14T00:00:00Z');
    const r = resolveDateRange(null, null, 'month', now);
    expect(r.endMs).toBe(now.getTime());
    // Start at month boundary 11 months back.
    expect(new Date(r.startIso).getUTCMonth()).toBe(5);
  });

  it('throws when start is after end', () => {
    expect(() => resolveDateRange('2026-05-01', '2026-01-01', 'month')).toThrow();
  });
});

describe('pLimit', () => {
  it('runs at most concurrency tasks at once', async () => {
    let active = 0;
    let peak = 0;
    const result = await pLimit(3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return item * 2;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it('preserves order even with random durations', async () => {
    const out = await pLimit(2, ['a', 'b', 'c', 'd'], async (s) => {
      await new Promise((r) => setTimeout(r, Math.random() * 20));
      return s.toUpperCase();
    });
    expect(out).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('groupRevenue', () => {
  const range = resolveDateRange('2026-01-01', '2026-12-31', 'month');

  it('buckets paid invoices by paid_at month', () => {
    const result = groupRevenue([
      invoice({ paid_at: '2026-01-15T00:00:00Z', amount_paid: 50000, status: 'paid' }),
      invoice({ paid_at: '2026-01-20T00:00:00Z', amount_paid: 25000, status: 'paid' }),
      invoice({ paid_at: '2026-02-05T00:00:00Z', amount_paid: 80000, status: 'paid' }),
    ], 'month', range);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].periodLabel).toMatch(/Jan 2026/);
    expect(result.rows[0].paidAmountCents).toBe(75000);
    expect(result.rows[0].invoiceCount).toBe(2);
    expect(result.totalPaidCents).toBe(155000);
    expect(result.totalInvoiceCount).toBe(3);
  });

  it('ignores invoices outside the range', () => {
    const result = groupRevenue([
      invoice({ paid_at: '2025-12-15T00:00:00Z', amount_paid: 99999, status: 'paid' }),
      invoice({ paid_at: '2026-06-15T00:00:00Z', amount_paid: 100, status: 'paid' }),
    ], 'month', range);
    expect(result.rows).toHaveLength(1);
    expect(result.totalPaidCents).toBe(100);
  });

  it('falls back to created_at when paid_at missing', () => {
    const result = groupRevenue([
      invoice({ paid_at: null, created_at: '2026-03-10T00:00:00Z', amount_paid: 12300, status: 'paid' }),
    ], 'month', range);
    expect(result.rows).toHaveLength(1);
    expect(result.totalPaidCents).toBe(12300);
  });

  it('outstanding amounts add to the row but do not count toward invoiceCount', () => {
    const result = groupRevenue([
      invoice({ paid_at: '2026-04-01T00:00:00Z', amount_paid: 0, amount_due: 5000, status: 'open' }),
    ], 'month', range);
    expect(result.totalOutstandingCents).toBe(5000);
    expect(result.totalInvoiceCount).toBe(0);
  });
});

describe('bucketAging', () => {
  const now = new Date('2026-05-14T00:00:00Z');

  it('places overdue invoices in the correct bucket', () => {
    const result = bucketAging([
      invoice({ due_date: '2026-05-13', amount_due: 100, status: 'open' }), // 1d -> 1-30
      invoice({ due_date: '2026-04-13', amount_due: 200, status: 'open' }), // ~31 -> 31-60
      invoice({ due_date: '2026-03-13', amount_due: 300, status: 'overdue' }), // ~62 -> 61-90
      invoice({ due_date: '2026-01-13', amount_due: 400, status: 'overdue' }), // ~120 -> 91+
      invoice({ due_date: '2026-05-20', amount_due: 50, status: 'open' }), // -6 -> Current
    ], now);
    expect(result.rows.find((r) => r.bucketLabel.startsWith('1–30'))!.totalAmountCents).toBe(100);
    expect(result.rows.find((r) => r.bucketLabel.startsWith('31–60'))!.totalAmountCents).toBe(200);
    expect(result.rows.find((r) => r.bucketLabel.startsWith('61–90'))!.totalAmountCents).toBe(300);
    expect(result.rows.find((r) => r.bucketLabel.startsWith('91+'))!.totalAmountCents).toBe(400);
    expect(result.rows.find((r) => r.bucketLabel.startsWith('Current'))!.totalAmountCents).toBe(50);
    expect(result.totalOutstandingCents).toBe(1050);
    expect(result.totalInvoiceCount).toBe(5);
  });

  it('skips paid invoices', () => {
    const result = bucketAging([
      invoice({ due_date: '2026-04-13', amount_due: 0, status: 'paid' }),
    ], now);
    expect(result.totalInvoiceCount).toBe(0);
  });

  it('falls back to issue_date + 30d when due_date missing', () => {
    const result = bucketAging([
      invoice({ due_date: null, issue_date: '2026-04-01', amount_due: 99, status: 'open' }),
    ], now);
    // Effective due = 2026-05-01; 13 days overdue -> 1-30 bucket.
    expect(result.rows.find((r) => r.bucketLabel.startsWith('1–30'))!.totalAmountCents).toBe(99);
  });
});

describe('sumBillableHours', () => {
  it('treats duration as seconds and converts to hours, skipping non-billable', () => {
    const hours = sumBillableHours([
      timeEntry({ duration: 3600, billable: true }),  // 1h
      timeEntry({ duration: 1800, billable: true }),  // 0.5h
      timeEntry({ duration: 7200, billable: false }), // skipped
    ]);
    expect(hours).toBe(1.5);
  });
});

describe('computeProfitability', () => {
  it('uses matter attorney_hourly_rate as default and overrides when provided', () => {
    const matters = [
      { ...matter({ id: 'm1', title: 'Smith', attorney_hourly_rate: asMajor(200) }), __revenueCents: 100_000 } as BackendMatter,
      { ...matter({ id: 'm2', title: 'Jones', attorney_hourly_rate: null }),  __revenueCents: 50_000 } as BackendMatter,
    ];
    const entries = new Map<string, BackendMatterTimeEntry[]>([
      ['m1', [timeEntry({ duration: 3600, billable: true })]],     // 1h
      ['m2', [timeEntry({ duration: 7200, billable: true })]],     // 2h
    ]);
    const result = computeProfitability(matters, entries, null);
    const smith = result.rows.find((r) => r.matterId === 'm1')!;
    expect(smith.estimatedCostCents).toBe(200 * 1 * 100);
    expect(smith.revenueCents).toBe(100_000);
    expect(smith.marginCents).toBe(100_000 - 200 * 100);
    const jones = result.rows.find((r) => r.matterId === 'm2')!;
    // Falls back to DEFAULT_PROFITABILITY_RATE_DOLLARS = 250
    expect(jones.estimatedCostCents).toBe(250 * 2 * 100);
  });

  it('honors override hourly rate', () => {
    const matters = [
      { ...matter({ id: 'm1', title: 'X', attorney_hourly_rate: asMajor(200) }), __revenueCents: 0 } as BackendMatter,
    ];
    const entries = new Map([['m1', [timeEntry({ duration: 3600, billable: true })]]]);
    const result = computeProfitability(matters, entries, 500);
    expect(result.rows[0].estimatedCostCents).toBe(500 * 1 * 100);
  });
});

describe('groupUtilizationByUser', () => {
  it('computes utilization% as billable / (billable + non-billable)', () => {
    const result = groupUtilizationByUser([
      timeEntry({ user_id: 'u1', duration: 3600, billable: true }),  // 1h
      timeEntry({ user_id: 'u1', duration: 3600, billable: false }), // 1h non-bill
      timeEntry({ user_id: 'u2', duration: 3600, billable: true }),  // 1h
    ]);
    const u1 = result.rows.find((r) => r.userId === 'u1')!;
    expect(u1.billableHours).toBe(1);
    expect(u1.nonBillableHours).toBe(1);
    expect(u1.utilizationPercent).toBe(50);
    const u2 = result.rows.find((r) => r.userId === 'u2')!;
    expect(u2.utilizationPercent).toBe(100);
    expect(result.totalBillableHours).toBe(2);
    expect(result.averageUtilizationPercent).toBeCloseTo(66.67, 1);
  });

  it('handles empty user_id as "unassigned"', () => {
    const result = groupUtilizationByUser([
      timeEntry({ user_id: null, duration: 1800, billable: true }),
    ]);
    expect(result.rows[0].userId).toBe('unassigned');
  });
});
