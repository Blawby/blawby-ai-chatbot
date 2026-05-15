/**
 * Pure-function aggregation tests for the Phase 3 reports (originally
 * blocked on blawby-backend#233 — now wired through real Railway calls).
 * The class-level Railway fetches are out of scope here; we exercise the
 * exported helpers with fixtures.
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateTrustLedger,
  aggregateWip,
  groupByOriginatingAttorney,
  groupByResponsibleAttorney,
  aggregateTaskProductivity,
  resolveDateRange,
} from '../../../../worker/services/ReportService';
import type { BackendInvoice } from '../../../../worker/types/wire/invoice';
import type { BackendMatter } from '../../../../worker/types/wire/matter';
import type {
  BackendTrustTransaction,
  BackendWipMatter,
  BackendPracticeTask,
} from '../../../../worker/types/wire/reports';

const trustTxn = (overrides: Partial<BackendTrustTransaction>): BackendTrustTransaction => ({
  id: overrides.id ?? `t_${Math.random()}`,
  ...overrides,
} as BackendTrustTransaction);

const wipMatter = (overrides: Partial<BackendWipMatter>): BackendWipMatter => ({
  matter_id: overrides.matter_id ?? 'm1',
  ...overrides,
} as BackendWipMatter);

const matter = (overrides: Partial<BackendMatter>): BackendMatter => ({
  id: overrides.id ?? `m_${Math.random()}`,
  ...overrides,
} as BackendMatter);

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

const task = (overrides: Partial<BackendPracticeTask>): BackendPracticeTask => ({
  id: overrides.id ?? `task_${Math.random()}`,
  status: overrides.status ?? 'pending',
  ...overrides,
} as BackendPracticeTask);

describe('aggregateTrustLedger', () => {
  const range = resolveDateRange('2026-01-01', '2026-12-31', 'year');

  it('partitions credits and debits, ignores out-of-range rows', () => {
    const result = aggregateTrustLedger([
      trustTxn({ id: 't1', occurred_at: '2026-03-15T00:00:00Z', amount: 50_000, balance_after: 50_000, type: 'deposit', description: 'Initial', client_name: 'Smith' }),
      trustTxn({ id: 't2', occurred_at: '2026-04-01T00:00:00Z', amount: -20_000, balance_after: 30_000, type: 'fee_payment', client_name: 'Smith' }),
      trustTxn({ id: 't3', occurred_at: '2025-12-15T00:00:00Z', amount: 99_000, balance_after: 0, type: 'deposit' }), // out of range
    ], range);
    expect(result.rows).toHaveLength(2);
    // Newest first
    expect(result.rows[0].id).toBe('t2');
    expect(result.totalCreditsCents).toBe(50_000);
    expect(result.totalDebitsCents).toBe(20_000);
    expect(result.endingBalanceCents).toBe(30_000); // latest row's balance_after
    expect(result.transactionCount).toBe(2);
  });

  it('resolves client name from join when client_name not present', () => {
    const result = aggregateTrustLedger([
      trustTxn({
        id: 't1',
        occurred_at: '2026-03-15T00:00:00Z',
        amount: 50_000,
        balance_after: 50_000,
        client: { name: 'Jones' },
      }),
    ], range);
    expect(result.rows[0].clientName).toBe('Jones');
  });

  it('returns empty aggregate when no rows', () => {
    const result = aggregateTrustLedger([], range);
    expect(result.rows).toEqual([]);
    expect(result.endingBalanceCents).toBe(0);
  });
});

describe('aggregateWip', () => {
  it('converts seconds to hours and sorts by amount desc', () => {
    const result = aggregateWip([
      wipMatter({ matter_id: 'm1', matter_title: 'Smith', unbilled_seconds: 3600, unbilled_amount: 25_000 }),
      wipMatter({ matter_id: 'm2', matter_title: 'Jones', unbilled_seconds: 7200, unbilled_amount: 100_000 }),
    ]);
    expect(result.rows[0].matterId).toBe('m2');
    expect(result.rows[0].unbilledHours).toBe(2);
    expect(result.rows[1].unbilledHours).toBe(1);
    expect(result.totalUnbilledAmountCents).toBe(125_000);
    expect(result.totalUnbilledHours).toBe(3);
    expect(result.matterCount).toBe(2);
  });

  it('skips rows with no unbilled time or amount', () => {
    const result = aggregateWip([
      wipMatter({ matter_id: 'm1', unbilled_seconds: 0, unbilled_amount: 0 }),
    ]);
    expect(result.rows).toHaveLength(0);
  });
});

describe('groupByOriginatingAttorney', () => {
  const range = resolveDateRange('2026-01-01', '2026-12-31', 'year');

  it('groups matters by originating attorney with paid invoice revenue', () => {
    const matters = [
      matter({ id: 'm1', title: 'Case A', originating_attorney_id: 'u1' }),
      matter({ id: 'm2', title: 'Case B', originating_attorney_id: 'u1' }),
      matter({ id: 'm3', title: 'Case C', originating_attorney_id: 'u2' }),
      matter({ id: 'm4', title: 'Case D', originating_attorney_id: null }),
    ];
    const invoices = [
      invoice({ matter_id: 'm1', paid_at: '2026-03-15T00:00:00Z', amount_paid: 100_000, status: 'paid' }),
      invoice({ matter_id: 'm2', paid_at: '2026-04-01T00:00:00Z', amount_paid: 50_000, status: 'paid' }),
      invoice({ matter_id: 'm3', paid_at: '2026-06-01T00:00:00Z', amount_paid: 200_000, status: 'paid' }),
      // Out-of-range invoice should not count
      invoice({ matter_id: 'm1', paid_at: '2025-06-01T00:00:00Z', amount_paid: 999, status: 'paid' }),
    ];
    const names = new Map([['u1', 'Alice'], ['u2', 'Bob']]);
    const result = groupByOriginatingAttorney(matters, invoices, range, names);
    // Sorted by revenue desc: Bob (200k), Alice (150k), Unassigned (0)
    expect(result.rows[0]).toMatchObject({ attorneyId: 'u2', attorneyName: 'Bob', revenueCents: 200_000, matterCount: 1 });
    expect(result.rows[1]).toMatchObject({ attorneyId: 'u1', attorneyName: 'Alice', revenueCents: 150_000, matterCount: 2 });
    expect(result.rows[2]).toMatchObject({ attorneyName: 'Unassigned', matterCount: 1 });
    expect(result.totalRevenueCents).toBe(350_000);
    expect(result.totalMatterCount).toBe(4);
  });

  it('falls back to attorney id when no name in map', () => {
    const result = groupByOriginatingAttorney(
      [matter({ id: 'm1', originating_attorney_id: 'u999' })],
      [],
      range,
      new Map()
    );
    expect(result.rows[0].attorneyName).toBe('u999');
  });
});

describe('groupByResponsibleAttorney', () => {
  it('counts open vs closed matters per attorney', () => {
    const matters = [
      matter({ id: 'm1', responsible_attorney_id: 'u1', status: 'active' }),
      matter({ id: 'm2', responsible_attorney_id: 'u1', status: 'closed' }),
      matter({ id: 'm3', responsible_attorney_id: 'u2', status: 'declined' }),
      matter({ id: 'm4', responsible_attorney_id: 'u2', status: 'discovery' }),
    ];
    const names = new Map([['u1', 'Alice'], ['u2', 'Bob']]);
    const result = groupByResponsibleAttorney(matters, names);
    const alice = result.rows.find((r) => r.attorneyId === 'u1')!;
    expect(alice).toMatchObject({ attorneyName: 'Alice', matterCount: 2, openCount: 1, closedCount: 1 });
    const bob = result.rows.find((r) => r.attorneyId === 'u2')!;
    expect(bob).toMatchObject({ attorneyName: 'Bob', matterCount: 2, openCount: 1, closedCount: 1 });
    expect(result.totalMatterCount).toBe(4);
    expect(result.totalOpenCount).toBe(2);
    expect(result.totalClosedCount).toBe(2);
  });

  it('groups unassigned attorneys', () => {
    const result = groupByResponsibleAttorney(
      [matter({ id: 'm1', responsible_attorney_id: null, status: 'active' })],
      new Map()
    );
    expect(result.rows[0]).toMatchObject({ attorneyName: 'Unassigned', matterCount: 1, openCount: 1 });
  });
});

describe('aggregateTaskProductivity', () => {
  const range = resolveDateRange('2026-01-01', '2026-12-31', 'year');

  it('counts completed/pending per assignee and computes avg cycle days', () => {
    const tasks = [
      task({
        id: 't1',
        assignee_id: 'u1',
        status: 'completed',
        created_at: '2026-03-01T00:00:00Z',
        completed_at: '2026-03-05T00:00:00Z', // 4 days
      }),
      task({
        id: 't2',
        assignee_id: 'u1',
        status: 'completed',
        created_at: '2026-04-01T00:00:00Z',
        completed_at: '2026-04-07T00:00:00Z', // 6 days
      }),
      task({ id: 't3', assignee_id: 'u1', status: 'pending' }),
      task({ id: 't4', assignee_id: 'u2', status: 'in_progress' }),
    ];
    const names = new Map([['u1', 'Alice'], ['u2', 'Bob']]);
    const result = aggregateTaskProductivity(tasks, range, names);
    const alice = result.rows.find((r) => r.assigneeId === 'u1')!;
    expect(alice.completed).toBe(2);
    expect(alice.pending).toBe(1);
    expect(alice.avgCycleDays).toBe(5);
    const bob = result.rows.find((r) => r.assigneeId === 'u2')!;
    expect(bob.completed).toBe(0);
    expect(bob.pending).toBe(1);
    expect(result.totalCompleted).toBe(2);
    expect(result.totalPending).toBe(2);
    expect(result.averageCycleDays).toBe(5);
  });

  it('ignores completed tasks outside the date range', () => {
    const result = aggregateTaskProductivity([
      task({
        id: 't1',
        assignee_id: 'u1',
        status: 'completed',
        created_at: '2025-01-01T00:00:00Z',
        completed_at: '2025-01-05T00:00:00Z',
      }),
    ], range, new Map());
    expect(result.totalCompleted).toBe(0);
  });

  it('returns zero avg cycle days when no completed tasks have created_at', () => {
    const result = aggregateTaskProductivity([
      task({
        id: 't1',
        assignee_id: 'u1',
        status: 'completed',
        created_at: null,
        completed_at: '2026-03-05T00:00:00Z',
      }),
    ], range, new Map());
    expect(result.totalCompleted).toBe(1);
    expect(result.averageCycleDays).toBe(0);
  });

});
