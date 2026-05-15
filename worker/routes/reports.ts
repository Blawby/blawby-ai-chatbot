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
import {
  ReportScheduleService,
  type ReportFrequency,
} from '../services/ReportScheduleService.js';
import { ReportDeliveryService } from '../services/ReportDeliveryService.js';
import { toCsv, type CsvColumn } from '../utils/csv.js';
import { parseJsonBody } from '../utils.js';

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

const TRUST_LEDGER_CSV_COLUMNS: CsvColumn<{
  occurredAt: string;
  clientName: string | null;
  description: string | null;
  type: string | null;
  amountCents: number;
  balanceCents: number;
}>[] = [
  { key: 'occurredAt', header: 'Date' },
  { key: 'clientName', header: 'Client' },
  { key: 'type', header: 'Type' },
  { key: 'description', header: 'Description' },
  { key: 'amountCents', header: 'Amount (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
  { key: 'balanceCents', header: 'Balance (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
];

const WIP_CSV_COLUMNS: CsvColumn<{
  matterTitle: string;
  unbilledHours: number;
  unbilledAmountCents: number;
}>[] = [
  { key: 'matterTitle', header: 'Matter' },
  { key: 'unbilledHours', header: 'Unbilled hours' },
  { key: 'unbilledAmountCents', header: 'Unbilled amount (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
];

const ORIGINATING_ATTORNEY_CSV_COLUMNS: CsvColumn<{
  attorneyName: string;
  matterCount: number;
  revenueCents: number;
}>[] = [
  { key: 'attorneyName', header: 'Attorney' },
  { key: 'matterCount', header: 'Matters' },
  { key: 'revenueCents', header: 'Revenue (USD)', format: (v) => (Number(v) / 100).toFixed(2) },
];

const MATTERS_BY_ATTORNEY_CSV_COLUMNS: CsvColumn<{
  attorneyName: string;
  matterCount: number;
  openCount: number;
  closedCount: number;
}>[] = [
  { key: 'attorneyName', header: 'Attorney' },
  { key: 'matterCount', header: 'Matters' },
  { key: 'openCount', header: 'Open' },
  { key: 'closedCount', header: 'Closed' },
];

const TASK_PRODUCTIVITY_CSV_COLUMNS: CsvColumn<{
  assigneeName: string;
  completed: number;
  pending: number;
  avgCycleDays: number;
}>[] = [
  { key: 'assigneeName', header: 'Assignee' },
  { key: 'completed', header: 'Completed' },
  { key: 'pending', header: 'Pending' },
  { key: 'avgCycleDays', header: 'Avg cycle (days)' },
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
  if (reportType === 'trust-ledger') {
    const range = parseRange(url, 'month');
    const result = await service.trustLedger(practiceId, headers, { range });
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalCreditsCents: result.totalCreditsCents,
        totalDebitsCents: result.totalDebitsCents,
        endingBalanceCents: result.endingBalanceCents,
        transactionCount: result.transactionCount,
      },
      filters: { start: range.startIso, end: range.endIso },
    };
  }
  if (reportType === 'wip') {
    const result = await service.wip(practiceId, headers);
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalUnbilledHours: result.totalUnbilledHours,
        totalUnbilledAmountCents: result.totalUnbilledAmountCents,
        matterCount: result.matterCount,
      },
      filters: {},
    };
  }
  if (reportType === 'originating-attorney') {
    const range = parseRange(url, 'month');
    const result = await service.originatingAttorney(practiceId, headers, request, { range });
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalRevenueCents: result.totalRevenueCents,
        totalMatterCount: result.totalMatterCount,
      },
      filters: { start: range.startIso, end: range.endIso },
    };
  }
  if (reportType === 'matters-by-attorney') {
    const result = await service.mattersByAttorney(practiceId, headers, request);
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalMatterCount: result.totalMatterCount,
        totalOpenCount: result.totalOpenCount,
        totalClosedCount: result.totalClosedCount,
      },
      filters: {},
    };
  }
  if (reportType === 'task-productivity') {
    const range = parseRange(url, 'month');
    const result = await service.taskProductivity(practiceId, headers, request, { range });
    return {
      rows: result.rows as unknown as Record<string, unknown>[],
      meta: {
        totalCompleted: result.totalCompleted,
        totalPending: result.totalPending,
        averageCycleDays: result.averageCycleDays,
      },
      filters: { start: range.startIso, end: range.endIso },
    };
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
    case 'trust-ledger': return TRUST_LEDGER_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    case 'wip': return WIP_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    case 'originating-attorney': return ORIGINATING_ATTORNEY_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    case 'matters-by-attorney': return MATTERS_BY_ATTORNEY_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
    case 'task-productivity': return TASK_PRODUCTIVITY_CSV_COLUMNS as unknown as CsvColumn<Record<string, unknown>>[];
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

// ─── schedules ───────────────────────────────────────────────────────────

const FREQUENCIES = new Set<ReportFrequency>(['daily', 'weekly', 'monthly']);

const handleSchedulesList = async (env: Env, practiceId: string): Promise<Response> => {
  const service = new ReportScheduleService(env);
  const schedules = await service.list(practiceId);
  return new Response(JSON.stringify({ success: true, data: schedules }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const handleScheduleCreate = async (
  request: Request,
  env: Env,
  practiceId: string
): Promise<Response> => {
  const body = await parseJsonBody(request) as {
    reportType?: string;
    frequency?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    hourUtc?: number;
    recipients?: unknown;
    filters?: unknown;
    active?: boolean;
  };
  if (!body.reportType || !VALID_REPORT_TYPES.has(body.reportType)) {
    throw HttpErrors.badRequest('Invalid reportType');
  }
  if (!body.frequency || !FREQUENCIES.has(body.frequency as ReportFrequency)) {
    throw HttpErrors.badRequest('Invalid frequency');
  }
  if (typeof body.hourUtc !== 'number' || body.hourUtc < 0 || body.hourUtc > 23) {
    throw HttpErrors.badRequest('hourUtc must be 0-23');
  }
  const recipients = Array.isArray(body.recipients)
    ? (body.recipients as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];
  const filters: Record<string, string> = {};
  if (body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)) {
    for (const [k, v] of Object.entries(body.filters as Record<string, unknown>)) {
      if (typeof v === 'string') filters[k] = v;
    }
  }
  const service = new ReportScheduleService(env);
  const created = await service.create(practiceId, {
    reportType: body.reportType,
    frequency: body.frequency as ReportFrequency,
    dayOfWeek: body.dayOfWeek,
    dayOfMonth: body.dayOfMonth,
    hourUtc: body.hourUtc,
    recipients,
    filters,
    active: body.active ?? true,
  });
  return new Response(JSON.stringify({ success: true, data: created }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

const handleScheduleUpdate = async (
  request: Request,
  env: Env,
  practiceId: string,
  scheduleId: string
): Promise<Response> => {
  const body = await parseJsonBody(request) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.frequency === 'string' && FREQUENCIES.has(body.frequency as ReportFrequency)) {
    patch.frequency = body.frequency;
  }
  if (typeof body.hourUtc === 'number') patch.hourUtc = body.hourUtc;
  if (typeof body.dayOfWeek === 'number') patch.dayOfWeek = body.dayOfWeek;
  if (typeof body.dayOfMonth === 'number') patch.dayOfMonth = body.dayOfMonth;
  if (Array.isArray(body.recipients)) {
    patch.recipients = (body.recipients as unknown[]).filter((r): r is string => typeof r === 'string');
  }
  if (body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)) {
    const filters: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.filters as Record<string, unknown>)) {
      if (typeof v === 'string') filters[k] = v;
    }
    patch.filters = filters;
  }
  if (typeof body.active === 'boolean') patch.active = body.active;

  const service = new ReportScheduleService(env);
  const updated = await service.update(practiceId, scheduleId, patch);
  if (!updated) throw HttpErrors.notFound('Schedule not found');
  return new Response(JSON.stringify({ success: true, data: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const handleScheduleDelete = async (
  env: Env,
  practiceId: string,
  scheduleId: string
): Promise<Response> => {
  const service = new ReportScheduleService(env);
  const ok = await service.delete(practiceId, scheduleId);
  if (!ok) throw HttpErrors.notFound('Schedule not found');
  return new Response(null, { status: 204 });
};

// ─── send-now + deliveries ───────────────────────────────────────────────

const handleSendNow = async (
  request: Request,
  env: Env,
  practiceId: string,
  authUserId: string,
  practiceSlug: string | null
): Promise<Response> => {
  const body = await parseJsonBody(request) as {
    reportType?: string;
    recipients?: unknown;
    filters?: unknown;
  };
  if (!body.reportType || !VALID_REPORT_TYPES.has(body.reportType)) {
    throw HttpErrors.badRequest('Invalid reportType');
  }
  const columns = csvColumnsFor(body.reportType);
  if (!columns) {
    throw HttpErrors.unprocessableEntity(`CSV export not supported for '${body.reportType}'`);
  }
  const recipients = Array.isArray(body.recipients)
    ? (body.recipients as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];
  const filters: Record<string, string> = {};
  if (body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)) {
    for (const [k, v] of Object.entries(body.filters as Record<string, unknown>)) {
      if (typeof v === 'string') filters[k] = v;
    }
  }

  // Synthesize the same query string our GET endpoint accepts so we reuse
  // the runReport pipeline 1:1 (period, start, end, hourlyRate).
  const synthUrl = new URL(request.url);
  const synthSearch = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) synthSearch.set(k, v);
  synthUrl.search = synthSearch.toString();
  const synthRequest = new Request(synthUrl.toString(), { method: 'GET', headers: request.headers });

  const deliveryService = new ReportDeliveryService(env);
  const delivery = await deliveryService.create({
    practiceId,
    reportType: body.reportType,
    filters,
    recipients,
    createdBy: authUserId,
  });

  try {
    const result = await runReport(body.reportType, synthRequest, env, practiceId);
    const csv = toCsv(result.rows, columns);
    const stored = await deliveryService.storeCsv(practiceId, delivery.id, body.reportType, csv);
    await deliveryService.markCompleted(delivery.id, stored);
    const completed = { ...delivery, status: 'completed' as const, ...stored, completedAt: new Date().toISOString() };
    if (recipients.length > 0) {
      await deliveryService.notifyRecipients({ practiceId, delivery: completed, practiceSlug });
    }
    return new Response(JSON.stringify({ success: true, data: completed }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await deliveryService.markFailed(delivery.id, message);
    throw err;
  }
};

const handleDeliveriesList = async (
  request: Request,
  env: Env,
  practiceId: string
): Promise<Response> => {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit')) || undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const service = new ReportDeliveryService(env);
  const result = await service.list(practiceId, { limit, cursor });
  return new Response(JSON.stringify({ success: true, data: result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const handleDeliveryGet = async (
  env: Env,
  practiceId: string,
  deliveryId: string
): Promise<Response> => {
  const service = new ReportDeliveryService(env);
  const delivery = await service.get(practiceId, deliveryId);
  if (!delivery) throw HttpErrors.notFound('Delivery not found');
  return new Response(JSON.stringify({ success: true, data: delivery }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const handleDeliveryDownload = async (
  env: Env,
  practiceId: string,
  deliveryId: string
): Promise<Response> => {
  const service = new ReportDeliveryService(env);
  const delivery = await service.get(practiceId, deliveryId);
  if (!delivery) throw HttpErrors.notFound('Delivery not found');
  if (delivery.status !== 'completed') {
    throw HttpErrors.conflict(`Delivery is ${delivery.status}, not completed`);
  }
  const { body, contentType, size } = await service.downloadBody(delivery);
  if (!body) throw HttpErrors.notFound('Delivery file not found in storage');
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filenameFor(delivery.reportType, practiceId)}"`,
  };
  if (size != null) headers['Content-Length'] = String(size);
  return new Response(body, { status: 200, headers });
};

// ─── route dispatch ──────────────────────────────────────────────────────

const resolvePracticeSlug = async (
  env: Env,
  practiceId: string,
  forwardHeaders: Record<string, string>
): Promise<string | null> => {
  try {
    const url = `${env.BACKEND_API_URL}/api/practice/details/${encodeURIComponent(practiceId)}`;
    const resp = await fetch(url, { headers: forwardHeaders });
    if (!resp.ok) return null;
    const json = await resp.json() as { slug?: string; data?: { slug?: string } };
    return json?.data?.slug ?? json?.slug ?? null;
  } catch {
    return null;
  }
};

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
    if (remainder === 'schedules') {
      if (request.method === 'GET') return await handleSchedulesList(env, practiceId);
      if (request.method === 'POST') return await handleScheduleCreate(request, env, practiceId);
      throw HttpErrors.methodNotAllowed('GET or POST');
    }
    const schedMatch = /^schedules\/([^/]+)$/.exec(remainder);
    if (schedMatch) {
      const scheduleId = decodeURIComponent(schedMatch[1]);
      if (request.method === 'PUT' || request.method === 'PATCH') {
        return await handleScheduleUpdate(request, env, practiceId, scheduleId);
      }
      if (request.method === 'DELETE') {
        return await handleScheduleDelete(env, practiceId, scheduleId);
      }
      if (request.method === 'GET') {
        const service = new ReportScheduleService(env);
        const schedule = await service.get(practiceId, scheduleId);
        if (!schedule) throw HttpErrors.notFound('Schedule not found');
        return new Response(JSON.stringify({ success: true, data: schedule }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw HttpErrors.methodNotAllowed('GET/PUT/PATCH/DELETE');
    }

    if (remainder === 'send-now') {
      if (request.method !== 'POST') throw HttpErrors.methodNotAllowed('POST');
      const forwardHeaders = buildForwardHeaders(request);
      const practiceSlug = await resolvePracticeSlug(env, practiceId, forwardHeaders);
      return await handleSendNow(request, env, practiceId, authContext.user.id, practiceSlug);
    }

    if (remainder === 'deliveries') {
      if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('GET');
      return await handleDeliveriesList(request, env, practiceId);
    }
    const downloadMatch = /^deliveries\/([^/]+)\/download$/.exec(remainder);
    if (downloadMatch) {
      if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('GET');
      return await handleDeliveryDownload(env, practiceId, decodeURIComponent(downloadMatch[1]));
    }
    const deliveryMatch = /^deliveries\/([^/]+)$/.exec(remainder);
    if (deliveryMatch) {
      if (request.method !== 'GET') throw HttpErrors.methodNotAllowed('GET');
      return await handleDeliveryGet(env, practiceId, decodeURIComponent(deliveryMatch[1]));
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
