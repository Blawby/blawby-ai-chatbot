/**
 * ReportService — Phase 1 + 2 report aggregation.
 *
 * Aggregation helpers are exported as pure functions so unit tests can
 * exercise them with fixture invoices/matters/time entries (no Railway
 * round-trips). The class wires those helpers into Railway fetches.
 *
 * Money convention:
 *   - Invoice fields are in cents (integers). Field names suffixed `*Cents`.
 *   - Matter hourly rates are in dollars (MajorAmount). Suffixed `*Dollars`.
 *   - Time totals are in hours (number). Suffixed `*Hours`.
 *
 * Pagination cap: invoices/matters paginate at MAX_LIST_PAGE_SIZE/page;
 * we cap at MAX_LIST_PAGES (set to 20) to keep worker time bounded.
 */

import type { Env } from '../types.js';
import { Logger } from '../utils/logger.js';
import { BackendInvoiceSchema, type BackendInvoice } from '../types/wire/invoice.js';
import {
  BackendMatterSchema,
  BackendMatterTimeEntrySchema,
  type BackendMatter,
  type BackendMatterTimeEntry,
} from '../types/wire/matter.js';
import {
  BackendTrustTransactionSchema,
  BackendWipMatterSchema,
  BackendPracticeTaskSchema,
  type BackendTrustTransaction,
  type BackendWipMatter,
  type BackendPracticeTask,
} from '../types/wire/reports.js';
import { RemoteApiService } from './RemoteApiService.js';

/**
 * Backend paths for report aggregations.
 *
 * `trustLedger` points at the live `/api/trust/{practiceId}/report` endpoint
 * (modules/trust/routes.ts in blawby-backend). The historical
 * `/api/trust-ledger/...` path referenced in blawby-backend#233 was never
 * shipped — leaving the worker pointed at it produces a 400 from the matters
 * `/api/matters/{practice_id}/{matter_id}` route's matter_id UUID validation,
 * which then surfaces as a 500 to the UI.
 *
 * `wip` has no backend endpoint yet — the matters module exposes
 * `/api/matters/{matter_id}/unbilled` per-matter, but no practice-wide
 * aggregate. The worker treats this as `BackendUnavailableError` so the UI
 * can show a "report unavailable" empty state instead of a hard error. When
 * the backend ships a real endpoint, update the path here.
 *
 * `tasks` is unchanged pending a backend audit.
 */
export const RAILWAY_REPORT_PATHS = {
  trustLedger: (practiceId: string) => `/api/trust/${encodeURIComponent(practiceId)}/report`,
  wip: (practiceId: string) => `/api/matters/${encodeURIComponent(practiceId)}/wip`,
  tasks: (practiceId: string) => `/api/tasks/${encodeURIComponent(practiceId)}`,
} as const;

export const MAX_LIST_PAGES = 20;
export const MAX_LIST_PAGE_SIZE = 100;
export const DEFAULT_PROFITABILITY_RATE_DOLLARS = 250;
export const TIME_ENTRY_CONCURRENCY = 5;

export class BackendUnavailableError extends Error {
  constructor(public reportType: string, message?: string) {
    super(message ?? `Report '${reportType}' depends on a backend endpoint that is not yet available.`);
    this.name = 'BackendUnavailableError';
  }
}

// ─── shared utilities ─────────────────────────────────────────────────────

export const unwrapRecord = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return unwrapRecord(record.data);
  }
  return record;
};

const extractListArray = (raw: unknown, candidateKeys: readonly string[]): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  if (record.data) return extractListArray(record.data, candidateKeys);
  return [];
};

/**
 * Bounded-concurrency promise runner. Runs `task` over `items` at most
 * `concurrency` at a time. Resolves with results in input order.
 */
export const pLimit = async <T, R>(
  concurrency: number,
  items: readonly T[],
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const width = Math.max(1, Math.min(concurrency, items.length));
  for (let w = 0; w < width; w += 1) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await task(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return out;
};

export interface ResolvedDateRange {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
}

const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const startOfQuarter = (d: Date) => {
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), q, 1));
};
const startOfYear = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

/**
 * Resolve `start`/`end` ISO inputs into a date range. Falls back to a
 * `period`-derived range when start/end aren't provided.
 */
export const resolveDateRange = (
  start: string | null | undefined,
  end: string | null | undefined,
  period: 'month' | 'quarter' | 'year' | undefined,
  now: Date = new Date()
): ResolvedDateRange => {
  let startMs: number;
  let endMs: number;
  if (start && end) {
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) {
      throw new Error('Invalid date range');
    }
    startMs = s;
    endMs = e;
  } else {
    endMs = now.getTime();
    const yearsBack = period === 'year' ? 1 : period === 'quarter' ? 0 : 0;
    const monthsBack = period === 'month' ? 11 : 0;
    const baseStart = period === 'year'
      ? startOfYear(new Date(now.getTime() - yearsBack * 365 * 24 * 60 * 60 * 1000))
      : period === 'quarter'
        ? startOfQuarter(now)
        : startOfMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1)));
    startMs = baseStart.getTime();
  }
  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
};

const formatPeriodLabel = (
  bucketStartMs: number,
  granularity: 'month' | 'quarter' | 'year'
): string => {
  const d = new Date(bucketStartMs);
  const year = d.getUTCFullYear();
  if (granularity === 'year') return String(year);
  if (granularity === 'quarter') {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `${year} Q${q}`;
  }
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${year}`;
};

const bucketStartFor = (
  d: Date,
  granularity: 'month' | 'quarter' | 'year'
): number => {
  if (granularity === 'year') return startOfYear(d).getTime();
  if (granularity === 'quarter') return startOfQuarter(d).getTime();
  return startOfMonth(d).getTime();
};

// ─── revenue ──────────────────────────────────────────────────────────────

export interface RevenueAggregateRow {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  invoiceCount: number;
  paidAmountCents: number;
  outstandingAmountCents: number;
}

export interface RevenueAggregate {
  rows: RevenueAggregateRow[];
  totalPaidCents: number;
  totalOutstandingCents: number;
  totalInvoiceCount: number;
}

const toCents = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value);
};

const parseDateMs = (raw: unknown): number | null => {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  return null;
};

/**
 * Group invoices by period (month/quarter/year). An invoice is bucketed by
 * `paid_at` when present (falling back to `created_at`). Unpaid invoices
 * contribute to `outstandingAmountCents` but not `invoiceCount`.
 */
export const groupRevenue = (
  invoices: readonly BackendInvoice[],
  granularity: 'month' | 'quarter' | 'year',
  range: ResolvedDateRange
): RevenueAggregate => {
  const buckets = new Map<number, RevenueAggregateRow>();
  let totalPaid = 0;
  let totalOutstanding = 0;
  let totalInvoiceCount = 0;

  for (const inv of invoices) {
    const eventMs = parseDateMs(inv.paid_at) ?? parseDateMs(inv.created_at);
    if (eventMs == null) continue;
    if (eventMs < range.startMs || eventMs > range.endMs) continue;
    const bucketKey = bucketStartFor(new Date(eventMs), granularity);
    let row = buckets.get(bucketKey);
    if (!row) {
      row = {
        periodLabel: formatPeriodLabel(bucketKey, granularity),
        periodStart: new Date(bucketKey).toISOString(),
        periodEnd: new Date(bucketKey).toISOString(),
        invoiceCount: 0,
        paidAmountCents: 0,
        outstandingAmountCents: 0,
      };
      buckets.set(bucketKey, row);
    }
    const paid = toCents(inv.amount_paid);
    const due = toCents(inv.amount_due);
    row.paidAmountCents += paid;
    row.outstandingAmountCents += due;
    if (paid > 0) {
      row.invoiceCount += 1;
      totalInvoiceCount += 1;
    }
    totalPaid += paid;
    totalOutstanding += due;
  }

  const rows = Array.from(buckets.values()).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return {
    rows,
    totalPaidCents: totalPaid,
    totalOutstandingCents: totalOutstanding,
    totalInvoiceCount,
  };
};

// ─── aging ────────────────────────────────────────────────────────────────

export interface AgingAggregateRow {
  bucketLabel: string;
  bucketMinDays: number;
  bucketMaxDays: number | null;
  invoiceCount: number;
  totalAmountCents: number;
}

export interface AgingAggregate {
  rows: AgingAggregateRow[];
  totalOutstandingCents: number;
  totalInvoiceCount: number;
}

const AGING_BUCKETS: Array<{ label: string; min: number; max: number | null }> = [
  { label: 'Current (≤ 0 days)', min: -Infinity, max: 0 },
  { label: '1–30 days', min: 1, max: 30 },
  { label: '31–60 days', min: 31, max: 60 },
  { label: '61–90 days', min: 61, max: 90 },
  { label: '91+ days', min: 91, max: null },
];

const isUnpaidStatus = (status: string | null | undefined): boolean => {
  if (!status) return true;
  const s = status.toLowerCase();
  return s === 'sent' || s === 'open' || s === 'overdue' || s === 'draft';
};

/**
 * Bucket unpaid invoices by daysOverdue from `due_date` (fallback
 * `issue_date + 30d`). `now` defaults to current time; tests pass a fixed
 * value.
 */
export const bucketAging = (
  invoices: readonly BackendInvoice[],
  now: Date = new Date()
): AgingAggregate => {
  const rows: AgingAggregateRow[] = AGING_BUCKETS.map((b) => ({
    bucketLabel: b.label,
    bucketMinDays: Number.isFinite(b.min) ? b.min : 0,
    bucketMaxDays: b.max,
    invoiceCount: 0,
    totalAmountCents: 0,
  }));
  let totalOutstandingCents = 0;
  let totalInvoiceCount = 0;
  const nowMs = now.getTime();

  for (const inv of invoices) {
    if (!isUnpaidStatus(inv.status)) continue;
    const due = toCents(inv.amount_due);
    if (due <= 0) continue;

    const dueMs = parseDateMs(inv.due_date) ?? (() => {
      const issued = parseDateMs(inv.issue_date);
      return issued != null ? issued + 30 * 86400000 : null;
    })();
    if (dueMs == null) continue;

    const daysOverdue = Math.floor((nowMs - dueMs) / 86400000);
    const idx = AGING_BUCKETS.findIndex((b) => daysOverdue >= b.min && (b.max == null || daysOverdue <= b.max));
    if (idx === -1) continue;
    rows[idx].invoiceCount += 1;
    rows[idx].totalAmountCents += due;
    totalOutstandingCents += due;
    totalInvoiceCount += 1;
  }

  return { rows, totalOutstandingCents, totalInvoiceCount };
};

// ─── profitability ────────────────────────────────────────────────────────

export interface ProfitabilityAggregateRow {
  matterId: string;
  matterTitle: string;
  revenueCents: number;
  estimatedCostCents: number;
  marginCents: number;
  billableHours: number;
}

export interface ProfitabilityAggregate {
  rows: ProfitabilityAggregateRow[];
  totalRevenueCents: number;
  totalCostCents: number;
  totalMarginCents: number;
  truncated: boolean;
}

const matterRateDollars = (matter: BackendMatter): number | null => {
  const rate = matter.attorney_hourly_rate;
  return typeof rate === 'number' && Number.isFinite(rate) ? rate : null;
};

/**
 * Sum billable seconds from `BackendMatterTimeEntry[]` and convert to hours.
 * Assumes `duration` is seconds (matches `totalBillableSeconds` naming in
 * wire schema). If backend later confirms minutes/hours, swap the divisor.
 */
export const sumBillableHours = (entries: readonly BackendMatterTimeEntry[]): number => {
  let totalSeconds = 0;
  for (const e of entries) {
    if (e.billable === false) continue;
    const d = e.duration;
    if (typeof d === 'number' && Number.isFinite(d)) totalSeconds += d;
  }
  return totalSeconds / 3600;
};

export const computeProfitability = (
  matters: readonly BackendMatter[],
  timeEntriesByMatter: Map<string, BackendMatterTimeEntry[]>,
  overrideHourlyRateDollars: number | null,
  truncated = false
): ProfitabilityAggregate => {
  const rows: ProfitabilityAggregateRow[] = [];
  let totalRevenue = 0;
  let totalCost = 0;
  let totalMargin = 0;
  for (const m of matters) {
    const entries = timeEntriesByMatter.get(m.id) ?? [];
    const hours = sumBillableHours(entries);
    const rate = overrideHourlyRateDollars ?? matterRateDollars(m) ?? DEFAULT_PROFITABILITY_RATE_DOLLARS;
    const estimatedCostCents = Math.round(hours * rate * 100);
    // Revenue per matter is the running paid-invoice subtotal injected by
    // the caller via m.metadata; computed in `ReportService.profitability`.
    const meta = (m as unknown as { __revenueCents?: number }).__revenueCents;
    const revenueCents = typeof meta === 'number' ? meta : 0;
    const marginCents = revenueCents - estimatedCostCents;
    rows.push({
      matterId: m.id,
      matterTitle: m.title ?? m.id,
      revenueCents,
      estimatedCostCents,
      marginCents,
      billableHours: Number(hours.toFixed(2)),
    });
    totalRevenue += revenueCents;
    totalCost += estimatedCostCents;
    totalMargin += marginCents;
  }
  rows.sort((a, b) => b.marginCents - a.marginCents);
  return {
    rows,
    totalRevenueCents: totalRevenue,
    totalCostCents: totalCost,
    totalMarginCents: totalMargin,
    truncated,
  };
};

// ─── utilization ──────────────────────────────────────────────────────────

export interface UtilizationAggregateRow {
  userId: string;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  utilizationPercent: number;
}

export interface UtilizationAggregate {
  rows: UtilizationAggregateRow[];
  totalBillableHours: number;
  totalNonBillableHours: number;
  averageUtilizationPercent: number;
  truncated: boolean;
}

export const groupUtilizationByUser = (
  entries: readonly BackendMatterTimeEntry[],
  truncated = false
): UtilizationAggregate => {
  const byUser = new Map<string, { billableSec: number; nonBillableSec: number }>();
  for (const e of entries) {
    const userId = e.user_id ?? 'unassigned';
    const d = typeof e.duration === 'number' && Number.isFinite(e.duration) ? e.duration : 0;
    let bucket = byUser.get(userId);
    if (!bucket) {
      bucket = { billableSec: 0, nonBillableSec: 0 };
      byUser.set(userId, bucket);
    }
    if (e.billable === false) bucket.nonBillableSec += d;
    else bucket.billableSec += d;
  }
  const rows: UtilizationAggregateRow[] = [];
  let totalBillable = 0;
  let totalNonBillable = 0;
  for (const [userId, b] of byUser) {
    const billable = b.billableSec / 3600;
    const nonBillable = b.nonBillableSec / 3600;
    const total = billable + nonBillable;
    const utilization = total > 0 ? (billable / total) * 100 : 0;
    rows.push({
      userId,
      billableHours: Number(billable.toFixed(2)),
      nonBillableHours: Number(nonBillable.toFixed(2)),
      totalHours: Number(total.toFixed(2)),
      utilizationPercent: Number(utilization.toFixed(2)),
    });
    totalBillable += billable;
    totalNonBillable += nonBillable;
  }
  rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
  const grandTotal = totalBillable + totalNonBillable;
  return {
    rows,
    totalBillableHours: Number(totalBillable.toFixed(2)),
    totalNonBillableHours: Number(totalNonBillable.toFixed(2)),
    averageUtilizationPercent: Number(
      (grandTotal > 0 ? (totalBillable / grandTotal) * 100 : 0).toFixed(2)
    ),
    truncated,
  };
};

// ─── trust ledger ─────────────────────────────────────────────────────────

export interface TrustLedgerAggregateRow {
  id: string;
  occurredAt: string;
  clientName: string | null;
  description: string | null;
  amountCents: number;
  balanceCents: number;
  type: string | null;
}

export interface TrustLedgerAggregate {
  rows: TrustLedgerAggregateRow[];
  totalCreditsCents: number;
  totalDebitsCents: number;
  endingBalanceCents: number;
  transactionCount: number;
}

const resolveClientName = (raw: BackendTrustTransaction): string | null => {
  if (raw.client_name) return raw.client_name;
  if (raw.client && typeof raw.client === 'object') {
    const c = raw.client as Record<string, unknown>;
    if (typeof c.name === 'string') return c.name;
    if (typeof c.full_name === 'string') return c.full_name;
  }
  return null;
};

export const aggregateTrustLedger = (
  transactions: readonly BackendTrustTransaction[],
  range: ResolvedDateRange
): TrustLedgerAggregate => {
  const filtered: TrustLedgerAggregateRow[] = [];
  let credits = 0;
  let debits = 0;
  for (const txn of transactions) {
    const ms = parseDateMs(txn.occurred_at);
    if (ms == null || ms < range.startMs || ms > range.endMs) continue;
    const amount = toCents(txn.amount);
    const balance = toCents(txn.balance_after);
    filtered.push({
      id: txn.id,
      occurredAt: new Date(ms).toISOString(),
      clientName: resolveClientName(txn),
      description: txn.description ?? null,
      amountCents: amount,
      balanceCents: balance,
      type: txn.type ?? null,
    });
    if (amount >= 0) credits += amount;
    else debits += Math.abs(amount);
  }
  // Newest first for display; ending balance reads the latest row.
  filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const endingBalanceCents = filtered.length > 0 ? filtered[0].balanceCents : 0;
  return {
    rows: filtered,
    totalCreditsCents: credits,
    totalDebitsCents: debits,
    endingBalanceCents,
    transactionCount: filtered.length,
  };
};

// ─── work in progress ─────────────────────────────────────────────────────

export interface WipAggregateRow {
  matterId: string;
  matterTitle: string;
  unbilledHours: number;
  unbilledAmountCents: number;
}

export interface WipAggregate {
  rows: WipAggregateRow[];
  totalUnbilledHours: number;
  totalUnbilledAmountCents: number;
  matterCount: number;
}

export const aggregateWip = (rows: readonly BackendWipMatter[]): WipAggregate => {
  const out: WipAggregateRow[] = [];
  let totalHours = 0;
  let totalAmount = 0;
  for (const r of rows) {
    const seconds = typeof r.unbilled_seconds === 'number' ? r.unbilled_seconds : 0;
    const hours = Number((seconds / 3600).toFixed(2));
    const amount = toCents(r.unbilled_amount);
    if (hours <= 0 && amount <= 0) continue;
    out.push({
      matterId: r.matter_id,
      matterTitle: r.matter_title ?? r.matter_id,
      unbilledHours: hours,
      unbilledAmountCents: amount,
    });
    totalHours += hours;
    totalAmount += amount;
  }
  out.sort((a, b) => b.unbilledAmountCents - a.unbilledAmountCents);
  return {
    rows: out,
    totalUnbilledHours: Number(totalHours.toFixed(2)),
    totalUnbilledAmountCents: totalAmount,
    matterCount: out.length,
  };
};

// ─── originating attorney ────────────────────────────────────────────────

export interface OriginatingAttorneyAggregateRow {
  attorneyId: string;
  attorneyName: string;
  matterCount: number;
  revenueCents: number;
}

export interface OriginatingAttorneyAggregate {
  rows: OriginatingAttorneyAggregateRow[];
  totalRevenueCents: number;
  totalMatterCount: number;
}

const UNASSIGNED_ATTORNEY_ID = 'unassigned';
const UNASSIGNED_ATTORNEY_LABEL = 'Unassigned';

export const groupByOriginatingAttorney = (
  matters: readonly BackendMatter[],
  invoices: readonly BackendInvoice[],
  range: ResolvedDateRange,
  attorneyNamesById: ReadonlyMap<string, string>
): OriginatingAttorneyAggregate => {
  const revenueByMatter = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.matter_id) continue;
    const eventMs = parseDateMs(inv.paid_at) ?? parseDateMs(inv.created_at);
    if (eventMs == null || eventMs < range.startMs || eventMs > range.endMs) continue;
    const paid = toCents(inv.amount_paid);
    if (paid <= 0) continue;
    revenueByMatter.set(inv.matter_id, (revenueByMatter.get(inv.matter_id) ?? 0) + paid);
  }

  const byAttorney = new Map<string, OriginatingAttorneyAggregateRow>();
  let totalRevenue = 0;
  for (const m of matters) {
    const attorneyId = m.originating_attorney_id ?? UNASSIGNED_ATTORNEY_ID;
    const matterRevenue = revenueByMatter.get(m.id) ?? 0;
    let row = byAttorney.get(attorneyId);
    if (!row) {
      row = {
        attorneyId,
        attorneyName: attorneyId === UNASSIGNED_ATTORNEY_ID
          ? UNASSIGNED_ATTORNEY_LABEL
          : attorneyNamesById.get(attorneyId) ?? attorneyId,
        matterCount: 0,
        revenueCents: 0,
      };
      byAttorney.set(attorneyId, row);
    }
    row.matterCount += 1;
    row.revenueCents += matterRevenue;
    totalRevenue += matterRevenue;
  }
  const rows = Array.from(byAttorney.values()).sort((a, b) => b.revenueCents - a.revenueCents);
  return {
    rows,
    totalRevenueCents: totalRevenue,
    totalMatterCount: matters.length,
  };
};

// ─── matters by attorney ─────────────────────────────────────────────────

export interface MattersByAttorneyAggregateRow {
  attorneyId: string;
  attorneyName: string;
  matterCount: number;
  openCount: number;
  closedCount: number;
}

export interface MattersByAttorneyAggregate {
  rows: MattersByAttorneyAggregateRow[];
  totalMatterCount: number;
  totalOpenCount: number;
  totalClosedCount: number;
}

const CLOSED_MATTER_STATUSES = new Set(['closed', 'declined', 'conflicted', 'referred']);

export const groupByResponsibleAttorney = (
  matters: readonly BackendMatter[],
  attorneyNamesById: ReadonlyMap<string, string>
): MattersByAttorneyAggregate => {
  const byAttorney = new Map<string, MattersByAttorneyAggregateRow>();
  let totalOpen = 0;
  let totalClosed = 0;
  for (const m of matters) {
    const attorneyId = m.responsible_attorney_id ?? UNASSIGNED_ATTORNEY_ID;
    let row = byAttorney.get(attorneyId);
    if (!row) {
      row = {
        attorneyId,
        attorneyName: attorneyId === UNASSIGNED_ATTORNEY_ID
          ? UNASSIGNED_ATTORNEY_LABEL
          : attorneyNamesById.get(attorneyId) ?? attorneyId,
        matterCount: 0,
        openCount: 0,
        closedCount: 0,
      };
      byAttorney.set(attorneyId, row);
    }
    row.matterCount += 1;
    const status = (m.status ?? '').toLowerCase();
    if (CLOSED_MATTER_STATUSES.has(status)) {
      row.closedCount += 1;
      totalClosed += 1;
    } else {
      row.openCount += 1;
      totalOpen += 1;
    }
  }
  const rows = Array.from(byAttorney.values()).sort((a, b) => b.matterCount - a.matterCount);
  return {
    rows,
    totalMatterCount: matters.length,
    totalOpenCount: totalOpen,
    totalClosedCount: totalClosed,
  };
};

// ─── task productivity ──────────────────────────────────────────────────

export interface TaskProductivityAggregateRow {
  assigneeId: string;
  assigneeName: string;
  completed: number;
  pending: number;
  avgCycleDays: number;
}

export interface TaskProductivityAggregate {
  rows: TaskProductivityAggregateRow[];
  totalCompleted: number;
  totalPending: number;
  averageCycleDays: number;
}

const COMPLETED_TASK_STATUS = 'completed';

export const aggregateTaskProductivity = (
  tasks: readonly BackendPracticeTask[],
  range: ResolvedDateRange,
  assigneeNamesById: ReadonlyMap<string, string>
): TaskProductivityAggregate => {
  type Bucket = { completed: number; pending: number; cycleDaysSum: number; cycleDaysCount: number };
  const byAssignee = new Map<string, Bucket>();
  let totalCompleted = 0;
  let totalPending = 0;
  let cycleDaysSum = 0;
  let cycleDaysCount = 0;

  for (const t of tasks) {
    const assigneeId = t.assignee_id ?? UNASSIGNED_ATTORNEY_ID;
    let bucket = byAssignee.get(assigneeId);
    if (!bucket) {
      bucket = { completed: 0, pending: 0, cycleDaysSum: 0, cycleDaysCount: 0 };
      byAssignee.set(assigneeId, bucket);
    }
    const status = (t.status ?? '').toLowerCase();
    if (status === COMPLETED_TASK_STATUS) {
      const createdMs = parseDateMs(t.created_at);
      const completedMs = parseDateMs(t.completed_at) ?? parseDateMs(t.updated_at);
      if (completedMs == null) continue;
      if (completedMs < range.startMs || completedMs > range.endMs) continue;
      bucket.completed += 1;
      totalCompleted += 1;
      if (createdMs != null && completedMs >= createdMs) {
        const days = (completedMs - createdMs) / 86_400_000;
        bucket.cycleDaysSum += days;
        bucket.cycleDaysCount += 1;
        cycleDaysSum += days;
        cycleDaysCount += 1;
      }
    } else if (status !== '') {
      bucket.pending += 1;
      totalPending += 1;
    }
  }

  const rows: TaskProductivityAggregateRow[] = [];
  for (const [assigneeId, b] of byAssignee) {
    if (b.completed === 0 && b.pending === 0) continue;
    rows.push({
      assigneeId,
      assigneeName: assigneeId === UNASSIGNED_ATTORNEY_ID
        ? UNASSIGNED_ATTORNEY_LABEL
        : assigneeNamesById.get(assigneeId) ?? assigneeId,
      completed: b.completed,
      pending: b.pending,
      avgCycleDays: b.cycleDaysCount > 0 ? Number((b.cycleDaysSum / b.cycleDaysCount).toFixed(2)) : 0,
    });
  }
  rows.sort((a, b) => b.completed - a.completed);
  return {
    rows,
    totalCompleted,
    totalPending,
    averageCycleDays: cycleDaysCount > 0 ? Number((cycleDaysSum / cycleDaysCount).toFixed(2)) : 0,
  };
};

// ─── service class ────────────────────────────────────────────────────────

export interface ListResult<T> {
  items: T[];
  truncated: boolean;
}

export class ReportService {
  constructor(private readonly env: Env) {}

  private get backendUrl(): string {
    const url = this.env.BACKEND_API_URL;
    if (!url) throw new Error('BACKEND_API_URL not configured');
    return url;
  }

  private async fetchAllPages<T>(
    path: string,
    headers: Record<string, string>,
    candidateKeys: readonly string[],
    label: string
  ): Promise<ListResult<T>> {
    const all: T[] = [];
    let truncated = false;
    for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
      try {
        const url = `${this.backendUrl}${path}?page=${page}&limit=${MAX_LIST_PAGE_SIZE}`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) {
          Logger.warn(`reports: ${label} page ${page} returned ${resp.status}`);
          if (all.length > 0) truncated = true;
          break;
        }
        const json = await resp.json();
        const items = extractListArray(json, candidateKeys);
        all.push(...(items as T[]));
        if (items.length < MAX_LIST_PAGE_SIZE) {
          return { items: all, truncated: false };
        }
      } catch (err) {
        Logger.warn(`reports: ${label} page ${page} failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
        if (all.length > 0) truncated = true;
        break;
      }
    }
    truncated = all.length >= MAX_LIST_PAGES * MAX_LIST_PAGE_SIZE;
    return { items: all, truncated };
  }

  async fetchInvoices(practiceId: string, headers: Record<string, string>): Promise<BackendInvoice[]> {
    const { items } = await this.fetchAllPages<unknown>(
      `/api/invoices/${encodeURIComponent(practiceId)}`,
      headers,
      ['invoices', 'items'],
      'invoices'
    );
    const parsed: BackendInvoice[] = [];
    for (const raw of items) {
      const result = BackendInvoiceSchema.safeParse(raw);
      if (result.success) parsed.push(result.data);
    }
    return parsed;
  }

  async fetchMatters(practiceId: string, headers: Record<string, string>): Promise<ListResult<BackendMatter>> {
    const { items, truncated } = await this.fetchAllPages<unknown>(
      `/api/matters/${encodeURIComponent(practiceId)}`,
      headers,
      ['matters', 'items'],
      'matters'
    );
    const parsed: BackendMatter[] = [];
    for (const raw of items) {
      const result = BackendMatterSchema.safeParse(raw);
      if (result.success) parsed.push(result.data);
    }
    return { items: parsed, truncated };
  }

  async fetchTimeEntriesForMatter(
    practiceId: string,
    matterId: string,
    headers: Record<string, string>
  ): Promise<BackendMatterTimeEntry[]> {
    try {
      const url = `${this.backendUrl}/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/time-entries`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) return [];
      const json = await resp.json();
      const items = extractListArray(json, ['time_entries', 'timeEntries', 'items']);
      const out: BackendMatterTimeEntry[] = [];
      for (const raw of items) {
        const result = BackendMatterTimeEntrySchema.safeParse(raw);
        if (result.success) out.push(result.data);
      }
      return out;
    } catch (err) {
      Logger.warn(`reports: time entries for ${matterId} failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async revenue(
    practiceId: string,
    headers: Record<string, string>,
    options: { period: 'month' | 'quarter' | 'year'; range: ResolvedDateRange }
  ): Promise<RevenueAggregate> {
    const invoices = await this.fetchInvoices(practiceId, headers);
    return groupRevenue(invoices, options.period, options.range);
  }

  async aging(
    practiceId: string,
    headers: Record<string, string>,
    options: { now?: Date }
  ): Promise<AgingAggregate> {
    const invoices = await this.fetchInvoices(practiceId, headers);
    return bucketAging(invoices, options.now ?? new Date());
  }

  async profitability(
    practiceId: string,
    headers: Record<string, string>,
    options: {
      range: ResolvedDateRange;
      overrideHourlyRateDollars: number | null;
    }
  ): Promise<ProfitabilityAggregate> {
    const [invoices, mattersResult] = await Promise.all([
      this.fetchInvoices(practiceId, headers),
      this.fetchMatters(practiceId, headers),
    ]);
    const matters = mattersResult.items;

    // Per-matter paid revenue restricted to the date range.
    const revenueByMatter = new Map<string, number>();
    for (const inv of invoices) {
      const matterId = inv.matter_id;
      if (!matterId) continue;
      const eventMs = parseDateMs(inv.paid_at) ?? parseDateMs(inv.created_at);
      if (eventMs == null) continue;
      if (eventMs < options.range.startMs || eventMs > options.range.endMs) continue;
      const paid = toCents(inv.amount_paid);
      if (paid <= 0) continue;
      revenueByMatter.set(matterId, (revenueByMatter.get(matterId) ?? 0) + paid);
    }

    // Fetch time entries with bounded concurrency.
    const timeEntriesByMatter = new Map<string, BackendMatterTimeEntry[]>();
    const entriesList = await pLimit(
      TIME_ENTRY_CONCURRENCY,
      matters,
      (m) => this.fetchTimeEntriesForMatter(practiceId, m.id, headers)
    );
    matters.forEach((m, i) => {
      const inRange = entriesList[i].filter((e) => {
        const ms = parseDateMs(e.start_time) ?? parseDateMs(e.end_time) ?? parseDateMs(e.created_at);
        if (ms == null) return true;
        return ms >= options.range.startMs && ms <= options.range.endMs;
      });
      timeEntriesByMatter.set(m.id, inRange);
    });

    const decoratedMatters = matters.map((m) => ({
      ...m,
      __revenueCents: revenueByMatter.get(m.id) ?? 0,
    })) as BackendMatter[];

    return computeProfitability(
      decoratedMatters,
      timeEntriesByMatter,
      options.overrideHourlyRateDollars,
      mattersResult.truncated
    );
  }

  async utilization(
    practiceId: string,
    headers: Record<string, string>,
    options: { range: ResolvedDateRange }
  ): Promise<UtilizationAggregate> {
    const { items: matters, truncated } = await this.fetchMatters(practiceId, headers);
    const entriesList = await pLimit(
      TIME_ENTRY_CONCURRENCY,
      matters,
      (m) => this.fetchTimeEntriesForMatter(practiceId, m.id, headers)
    );
    const allEntries: BackendMatterTimeEntry[] = [];
    for (const list of entriesList) {
      for (const e of list) {
        const ms = parseDateMs(e.start_time) ?? parseDateMs(e.end_time) ?? parseDateMs(e.created_at);
        if (ms != null && (ms < options.range.startMs || ms > options.range.endMs)) continue;
        allEntries.push(e);
      }
    }
    return groupUtilizationByUser(allEntries, truncated);
  }

  // ─── Phase 3 (blawby-backend#233) ──────────────────────────────────────

  /**
   * Returns a `Map<userId, displayName>` for the practice's team. Used to
   * resolve `originating_attorney_id` / `responsible_attorney_id` /
   * `assignee_id` to human-readable names. Falls back to an empty map if
   * the team endpoint is unavailable — display will fall back to the id.
   */
  private async fetchAttorneyNames(
    practiceId: string,
    request: Request
  ): Promise<Map<string, string>> {
    try {
      const team = await RemoteApiService.getPracticeTeam(this.env, practiceId, request);
      const map = new Map<string, string>();
      for (const m of team.members) {
        if (m.userId && m.name) map.set(m.userId, m.name);
        else if (m.userId) map.set(m.userId, m.email || m.userId);
      }
      return map;
    } catch (err) {
      Logger.warn('reports: practice team fetch failed', {
        practiceId,
        error: err instanceof Error ? err.message : String(err),
      });
      return new Map();
    }
  }

  async trustLedger(
    practiceId: string,
    headers: Record<string, string>,
    options: { range: ResolvedDateRange }
  ): Promise<TrustLedgerAggregate> {
    const path = RAILWAY_REPORT_PATHS.trustLedger(practiceId);
    // Backend (modules/trust/routes.ts) expects `start_date` / `end_date` ISO
    // datetimes; the worker's older code used `start` / `end` which the
    // backend silently ignored.
    const params = new URLSearchParams({
      start_date: options.range.startIso,
      end_date: options.range.endIso,
    });
    const url = `${this.backendUrl}${path}?${params.toString()}`;
    let resp: Response;
    try {
      resp = await fetch(url, { headers });
    } catch (err) {
      throw new BackendUnavailableError('trust-ledger', err instanceof Error ? err.message : 'network error');
    }
    // 404/501 → endpoint not deployed. 400 → URL pattern mismatch upstream
    // (e.g. the backend's matters route accidentally catches `/api/...../wip`
    // and complains about UUID format). All three signal "backend doesn't
    // support this report yet"; surface as `BackendUnavailableError` so the
    // route returns a graceful 503 with `BACKEND_NOT_AVAILABLE` rather than a
    // generic 500.
    if (resp.status === 404 || resp.status === 501 || resp.status === 400) {
      throw new BackendUnavailableError('trust-ledger');
    }
    if (!resp.ok) {
      throw new Error(`trust-ledger upstream returned ${resp.status}`);
    }
    const json = await resp.json();
    const rawItems = extractListArray(json, ['transactions', 'items', 'data']);
    const parsed: BackendTrustTransaction[] = [];
    for (const raw of rawItems) {
      const result = BackendTrustTransactionSchema.safeParse(raw);
      if (result.success) parsed.push(result.data);
    }
    return aggregateTrustLedger(parsed, options.range);
  }

  async wip(
    practiceId: string,
    headers: Record<string, string>
  ): Promise<WipAggregate> {
    const path = RAILWAY_REPORT_PATHS.wip(practiceId);
    const url = `${this.backendUrl}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, { headers });
    } catch (err) {
      throw new BackendUnavailableError('wip', err instanceof Error ? err.message : 'network error');
    }
    // Same "backend doesn't have this yet" signals as trustLedger above.
    // The wip endpoint specifically has never shipped — the matters module
    // only exposes per-matter `/api/matters/{matter_id}/unbilled`, no
    // practice-wide aggregate — so this branch is the steady state until a
    // backend PR adds one.
    if (resp.status === 404 || resp.status === 501 || resp.status === 400) {
      throw new BackendUnavailableError('wip');
    }
    if (!resp.ok) {
      throw new Error(`wip upstream returned ${resp.status}`);
    }
    const json = await resp.json();
    const rawItems = extractListArray(json, ['matters', 'items', 'data']);
    const parsed: BackendWipMatter[] = [];
    for (const raw of rawItems) {
      const result = BackendWipMatterSchema.safeParse(raw);
      if (result.success) parsed.push(result.data);
    }
    return aggregateWip(parsed);
  }

  async originatingAttorney(
    practiceId: string,
    headers: Record<string, string>,
    request: Request,
    options: { range: ResolvedDateRange }
  ): Promise<OriginatingAttorneyAggregate> {
    const [invoices, mattersResult, attorneyNames] = await Promise.all([
      this.fetchInvoices(practiceId, headers),
      this.fetchMatters(practiceId, headers),
      this.fetchAttorneyNames(practiceId, request),
    ]);
    return groupByOriginatingAttorney(mattersResult.items, invoices, options.range, attorneyNames);
  }

  async mattersByAttorney(
    practiceId: string,
    headers: Record<string, string>,
    request: Request
  ): Promise<MattersByAttorneyAggregate> {
    const [mattersResult, attorneyNames] = await Promise.all([
      this.fetchMatters(practiceId, headers),
      this.fetchAttorneyNames(practiceId, request),
    ]);
    return groupByResponsibleAttorney(mattersResult.items, attorneyNames);
  }

  async taskProductivity(
    practiceId: string,
    headers: Record<string, string>,
    request: Request,
    options: { range: ResolvedDateRange }
  ): Promise<TaskProductivityAggregate> {
    const path = RAILWAY_REPORT_PATHS.tasks(practiceId);
    const all: BackendPracticeTask[] = [];
    for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
      const url = `${this.backendUrl}${path}?page=${page}&limit=${MAX_LIST_PAGE_SIZE}`;
      let resp: Response;
      try {
        resp = await fetch(url, { headers });
      } catch (err) {
        if (page === 1) {
          throw new BackendUnavailableError('task-productivity', err instanceof Error ? err.message : 'network error');
        }
        break;
      }
      if (resp.status === 404 || resp.status === 501) {
        if (page === 1) throw new BackendUnavailableError('task-productivity');
        break;
      }
      if (!resp.ok) {
        if (page === 1) throw new Error(`task-productivity upstream returned ${resp.status}`);
        break;
      }
      const json = await resp.json();
      const items = extractListArray(json, ['tasks', 'items', 'data']);
      for (const raw of items) {
        const result = BackendPracticeTaskSchema.safeParse(raw);
        if (result.success) all.push(result.data);
      }
      if (items.length < MAX_LIST_PAGE_SIZE) break;
    }
    const attorneyNames = await this.fetchAttorneyNames(practiceId, request);
    return aggregateTaskProductivity(all, options.range, attorneyNames);
  }
}
