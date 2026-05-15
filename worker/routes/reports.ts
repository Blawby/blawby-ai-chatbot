/**
 * /api/reports/:practiceId/* — legal-firm reports.
 *
 * Phase 1: revenue, aging + CSV export
 * Phase 2: profitability, utilization, schedules, send-now, deliveries
 * Phase 3: stubbed to 503 BACKEND_NOT_AVAILABLE until #233 ships.
 */

import type { Env } from '../types.js';
import { HttpErrors, handleError } from '../errorHandler.js';
import { getAttachedAuthContext } from '../middleware/compose.js';
import { requirePracticeMember } from '../middleware/auth.js';
import { buildForwardHeaders } from '../utils/intakeVisibility.js';
import {
  BackendUnavailableError,
  ReportService,
  resolveDateRange,
  type ResolvedDateRange,
} from '../services/ReportService.js';
import { toCsv, type CsvColumn } from '../utils/csv.js';

const PRACTICE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_REPORT_TYPES = new Set<string>([
  'revenue',
  'aging',
  'profitability',
  'utilization',
  'trust-ledger',
  'wip',
  'originating-attorney',
  'matters-by-attorney',
  'task-productivity',
]);

const PHASE_3_REPORTS = new Set<string>([
  'trust-ledger',
  'wip',
  'originating-attorney',
  'matters-by-attorney',
  'task-productivity',
]);

const VALID_PERIODS = new Set(['month', 'quarter', 'year']);

interface ReportEnvelope<T> {
  items: T[];
  total: number;
  generatedAt: string;
  filters: Record<string, string | undefined>;
  meta?: Record<string, unknown>;
}

const envelope = <T>(payload: ReportEnvelope<T>): Response =>
  new Response(JSON.stringify({ success: true, data: payload }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const csvResponse = (filename: string, body: string): Response =>
  new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });

const backendUnavailable = (reportType: string): Response =>
  new Response(
    JSON.stringify({
      success: false,
      error: `Report '${reportType}' depends on a backend endpoint that is not yet available.`,
      errorCode: 'BACKEND_NOT_AVAILABLE',
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );

const parsePeriod = (raw: string | null): 'month' | 'quarter' | 'year' => {
  if (raw && VALID_PERIODS.has(raw)) return raw as 'month' | 'quarter' | 'year';
  return 'month';
};

const parseRange = (url: URL, period: 'month' | 'quarter' | 'year'): ResolvedDateRange => {
  return resolveDateRange(
    url.searchParams.get('start'),
    url.searchParams.get('end'),
    period
  );
};

const parsePracticeId = (raw: string | undefined): string => {
  if (!raw) throw HttpErrors.badRequest('Practice ID required');
  let practiceId: string;
  try {
    practiceId = decodeURIComponent(raw);
  } catch {
    throw HttpErrors.badRequest('Invalid practice ID');
  }
  if (!PRACTICE_ID_RE.test(practiceId)) throw HttpErrors.badRequest('Invalid practice ID');
  return practiceId;
};

const filenameFor = (reportType: string, practiceId: string): string => {
  const date = new Date().toISOString().slice(0, 10);
  return `${reportType}-${practiceId}-${date}.csv`;
};

// ─── CSV column maps (mirror the report column specs) ───────────────────

const REVENUE_CSV_COLUMNS: CsvColumn<{
  periodLabel: string;
  invoiceCount: number;
  paidAmountCents: number;
  outstandingAmountCents: number;
}>[] = [
  { key: 'periodLabel', header: 'Period' },
  { key: 'invoiceCount', header: 'Invoices' },
  { key: 'paidAmountCents', header: 'Paid (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
  { key: 'outstandingAmountCents', header: 'Outstanding (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
];

const AGING_CSV_COLUMNS: CsvColumn<{
  bucketLabel: string;
  invoiceCount: number;
  totalAmountCents: number;
}>[] = [
  { key: 'bucketLabel', header: 'Bucket' },
  { key: 'invoiceCount', header: 'Invoices' },
  { key: 'totalAmountCents', header: 'Amount (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
];

const PROFITABILITY_CSV_COLUMNS: CsvColumn<{
  matterTitle: string;
  revenueCents: number;
  estimatedCostCents: number;
  marginCents: number;
  billableHours: number;
}>[] = [
  { key: 'matterTitle', header: 'Matter' },
  { key: 'revenueCents', header: 'Revenue (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
  { key: 'estimatedCostCents', header: 'Est. cost (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
  { key: 'marginCents', header: 'Margin (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
  { key: 'billableHours', header: 'Billable hours' },
];

const UTILIZATION_CSV_COLUMNS: CsvColumn<{
  userId: string;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  utilizationPercent: number;
}>[] = [
  { key: 'userId', header: 'User' },
  { key: 'billableHours', header: 'Billable hours' },
  { key: 'nonBillableHours', header: 'Non-billable hours' },
  { key: 'totalHours', header: 'Total hours' },
  { key: 'utilizationPercent', header: 'Utilization (%)' },
];

// ─── per-report handlers ─────────────────────────────────────────────────

const runReport = async (
  reportType: string,
  request: Request,
  env: Env,
  practiceId: string
): Promise<{ rows: Record<string, unknown>[]; meta: Record<string, unknown>; filters: Record<string, string | undefined> }> => {
  const url = new URL(request.url);
  const headers = buildForwardHeaders(request);
  const service = new ReportService(env);

  if (reportType === 'revenue') {
    const period = parsePeriod(url.searchParams.get('period'));
    const range = parseRange(url, period);
    const result = await service.revenue(practiceId, headers, { period, range });
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalPaidCents: result.totalPaidCents,
        totalOutstandingCents: result.totalOutstandingCents,
        totalInvoiceCount: result.totalInvoiceCount,
      },
      filters: { period, start: range.startIso, end: range.endIso },
    };
  }
  if (reportType === 'aging') {
    const range = parseRange(url, 'month');
    const result = await service.aging(practiceId, headers, { now: new Date() });
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalOutstandingCents: result.totalOutstandingCents,
        totalInvoiceCount: result.totalInvoiceCount,
      },
      filters: { start: range.startIso, end: range.endIso },
    };
  }
  if (reportType === 'profitability') {
    const range = parseRange(url, 'month');
    const rateRaw = url.searchParams.get('hourlyRate');
    const rate = rateRaw ? Number(rateRaw) : null;
    const result = await service.profitability(practiceId, headers, {
      range,
      overrideHourlyRateDollars: rate != null && Number.isFinite(rate) && rate > 0 ? rate : null,
    });
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalRevenueCents: result.totalRevenueCents,
        totalCostCents: result.totalCostCents,
        totalMarginCents: result.totalMarginCents,
        truncated: result.truncated,
      },
      filters: {
        start: range.startIso,
        end: range.endIso,
        hourlyRate: rate != null ? String(rate) : undefined,
      },
    };
  }
  if (reportType === 'utilization') {
    const range = parseRange(url, 'month');
    const result = await service.utilization(practiceId, headers, { range });
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalBillableHours: result.totalBillableHours,
        totalNonBillableHours: result.totalNonBillableHours,
        averageUtilizationPercent: result.averageUtilizationPercent,
        truncated: result.truncated,
      },
      filters: { start: range.startIso, end: range.endIso },
    };
  }
  if (PHASE_3_REPORTS.has(reportType)) {
    await service.forwardPhase3(reportType);
  }
  throw HttpErrors.notFound(`Unknown report type: ${reportType}`);
};

const handleGetReport = async (
  reportType: string,
  request: Request,
  env: Env,
  practiceId: string
): Promise<Response> => {
  const result = await runReport(reportType, request, env, practiceId);
  return envelope({
    items: result.rows,
    total: result.rows.length,
    generatedAt: new Date().toISOString(),
    filters: result.filters,
    meta: result.meta,
  });
};

const csvColumnsFor = (reportType: string): CsvColumn<Record<string, unknown>>[] | null => {
  switch (reportType) {
    case 'revenue': return REVENUE_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    case 'aging': return AGING_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    case 'profitability': return PROFITABILITY_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    case 'utilization': return UTILIZATION_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    default: return null;
  }
};

const handleExport = async (
  reportType: string,
  request: Request,
  env: Env,
  practiceId: string
): Promise<Response> => {
  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv') throw HttpErrors.unprocessableEntity('Only CSV format is supported');
  const columns = csvColumnsFor(reportType);
  if (!columns) {
    throw HttpErrors.unprocessableEntity(`CSV export not supported for '${reportType}'`);
  }
  const result = await runReport(reportType, request, env, practiceId);
  const body = toCsv(result.rows, columns);
  return csvResponse(filenameFor(reportType, practiceId), body);
};

// ─── route dispatch ──────────────────────────────────────────────────────

export async function handleReports(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/reports\/([^/]+)(?:\/(.+))?$/);
  if (!match) throw HttpErrors.notFound('Route not found');

  const practiceId = parsePracticeId(match[1]);
  const remainder = match[2] ?? '';

  // Auth + practice membership before any data access.
  const authContext = getAttachedAuthContext(request);
  if (!authContext) throw HttpErrors.unauthorized('Authentication required');
  if (authContext.isAnonymous) throw HttpErrors.forbidden('Access denied');
  await requirePracticeMember(request, env, practiceId, 'paralegal');

  if (!env.BACKEND_API_URL) {
    throw HttpErrors.internalServerError('BACKEND_API_URL not configured');
  }

  try {
    // Phase 2 endpoints (schedules / send-now / deliveries) — wired in milestone 4.
    if (remainder.startsWith('schedules')) {
      throw HttpErrors.notFound('Schedules ships in milestone 4');
    }
    if (remainder === 'send-now') {
      throw HttpErrors.notFound('Send-now ships in milestone 4');
    }
    if (remainder.startsWith('deliveries')) {
      throw HttpErrors.notFound('Deliveries ships in milestone 4');
    }

    if (remainder.startsWith('export/')) {
      const reportType = remainder.slice('export/'.length);
      if (!VALID_REPORT_TYPES.has(reportType)) throw HttpErrors.notFound(`Unknown report: ${reportType}`);
      if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('Only GET allowed for export');
      return await handleExport(reportType, request, env, practiceId);
    }

    if (VALID_REPORT_TYPES.has(remainder)) {
      if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('Only GET allowed');
      return await handleGetReport(remainder, request, env, practiceId);
    }

    throw HttpErrors.notFound(`Unknown reports path: /${remainder}`);
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      return backendUnavailable(err.reportType);
    }
    return handleError(err);
  }
}
