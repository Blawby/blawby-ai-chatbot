import { z } from 'zod';
import type { Env } from '../types.js';
import { BackendMatterSchema, type BackendMatter } from '../types/wire/matter.js';
import {
  ReportService,
  type ReportPeriod,
  type ResolvedDateRange,
  type RevenueAggregateRow,
  type UtilizationAggregateRow,
} from './ReportService.js';

const IntakeSummarySchema = z.object({
  uuid: z.string(),
  triage_status: z.string(),
  case_strength: z.number().nullable().optional(),
  metadata: z.object({
    practice_service_uuid: z.string().optional(),
    intake_title: z.string().optional(),
  }).passthrough(),
}).passthrough();

export type ReportSummaryIntake = z.infer<typeof IntakeSummarySchema>;

export interface ReportSummaryObservation {
  id: 'revenue' | 'conversion' | 'utilization' | 'time-to-close';
  text: string;
  signal: 'positive' | 'attention' | 'neutral';
}

export interface ReportSummaryResult {
  narrative: string;
  groundingLabel: string;
  observations: ReportSummaryObservation[];
  revenue: {
    items: RevenueAggregateRow[];
    totalPaidCents: number;
    totalOutstandingCents: number;
    totalInvoiceCount: number;
    currentPaidCents: number;
    currentInvoiceCount: number;
    priorPaidCents: number;
    deltaPercent: number | null;
  };
  utilization: {
    items: UtilizationAggregateRow[];
    totalBillableHours: number;
    totalNonBillableHours: number;
    averageUtilizationPercent: number;
  };
  intakes: ReportSummaryIntake[];
  matters: BackendMatter[];
  conversionPercent: number | null;
  acceptedIntakeCount: number;
  totalIntakeCount: number;
  medianTimeToCloseDays: number | null;
  closedMatterCount: number;
}

const extractCollection = (raw: unknown, key: string): unknown[] => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid reports summary ${key} response`);
  }
  const record = raw as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : record;
  const value = data[key];
  if (!Array.isArray(value)) throw new Error(`Invalid reports summary ${key} response`);
  return value;
};

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const formatCurrency = (cents: number): string => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(cents / 100);

const periodNoun = (period: ReportPeriod): string => period === 'year' ? 'year' : period;

const periodKey = (date: Date, period: ReportPeriod): string => {
  const year = date.getUTCFullYear();
  if (period === 'year') return String(year);
  if (period === 'quarter') return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  if (period === 'month') return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const day = date.getUTCDay();
  const monday = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10);
};

const priorPeriodDate = (date: Date, period: ReportPeriod): Date => {
  if (period === 'year') return new Date(Date.UTC(date.getUTCFullYear() - 1, 0, 1));
  if (period === 'quarter') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 3, 1));
  if (period === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return new Date(date.getTime() - 7 * 86_400_000);
};

export class ReportSummaryService {
  constructor(private readonly env: Env) {}

  private async fetchCollection(path: string, headers: Record<string, string>): Promise<unknown> {
    const base = this.env.BACKEND_API_URL;
    if (!base) throw new Error('BACKEND_API_URL not configured');
    const response = await fetch(`${base.replace(/\/+$/, '')}${path}`, { headers });
    if (!response.ok) throw new Error(`Reports summary upstream returned ${response.status}`);
    return response.json();
  }

  async get(
    practiceId: string,
    headers: Record<string, string>,
    period: ReportPeriod,
    range: ResolvedDateRange,
  ): Promise<ReportSummaryResult> {
    const reports = new ReportService(this.env);
    const [revenue, utilization, intakesRaw, mattersRaw] = await Promise.all([
      reports.revenue(practiceId, headers, { period, range }),
      reports.utilization(practiceId, headers, { range }),
      this.fetchCollection(`/api/practice-client-intakes/${encodeURIComponent(practiceId)}?page=1&limit=100`, headers),
      this.fetchCollection(`/api/matters/${encodeURIComponent(practiceId)}?page=1&limit=100`, headers),
    ]);

    const intakes = extractCollection(intakesRaw, 'intakes').map((item) => {
      const parsed = IntakeSummarySchema.safeParse(item);
      if (!parsed.success) throw new Error('Invalid intake in reports summary response');
      return parsed.data;
    });
    const matters = extractCollection(mattersRaw, 'matters').map((item) => {
      const parsed = BackendMatterSchema.safeParse(item);
      if (!parsed.success) throw new Error('Invalid matter in reports summary response');
      return parsed.data;
    });

    const acceptedIntakeCount = intakes.filter((item) => item.triage_status === 'accepted').length;
    const conversionPercent = intakes.length > 0
      ? Math.round((acceptedIntakeCount / intakes.length) * 100)
      : null;
    const closeDurations = matters.flatMap((matter) => {
      if (matter.status !== 'closed' || !matter.open_date || !matter.close_date) return [];
      const opened = Date.parse(matter.open_date);
      const closed = Date.parse(matter.close_date);
      if (!Number.isFinite(opened) || !Number.isFinite(closed) || closed < opened) return [];
      return [(closed - opened) / 86_400_000];
    });
    const medianTimeToCloseDays = median(closeDurations);
    const rangeEnd = new Date(range.endMs);
    const currentKey = periodKey(rangeEnd, period);
    const priorKey = periodKey(priorPeriodDate(rangeEnd, period), period);
    const current = revenue.rows.find((row) => periodKey(new Date(row.periodStart), period) === currentKey);
    const previous = revenue.rows.find((row) => periodKey(new Date(row.periodStart), period) === priorKey) ?? null;
    const currentPaid = current?.paidAmountCents ?? 0;
    const delta = previous && previous.paidAmountCents > 0
      ? Math.round(((currentPaid - previous.paidAmountCents) / previous.paidAmountCents) * 100)
      : null;

    const narrative: string[] = [currentPaid > 0
      ? `You billed ${formatCurrency(currentPaid)}${delta == null ? '' : `, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)}% from the prior ${periodNoun(period)}`}, across ${current?.invoiceCount ?? 0} invoice${current?.invoiceCount === 1 ? '' : 's'}.`
      : `No paid invoices are recorded for the current ${periodNoun(period)}.`];
    if (conversionPercent != null) {
      narrative.push(`Intake conversion is ${conversionPercent}% (${acceptedIntakeCount} of ${intakes.length}).`);
    }
    if (medianTimeToCloseDays != null) {
      narrative.push(`Median time-to-close is ${Math.round(medianTimeToCloseDays)} days across ${closeDurations.length} closed matter${closeDurations.length === 1 ? '' : 's'}.`);
    }
    narrative.push(`Billable utilization is ${utilization.averageUtilizationPercent.toFixed(0)}% (${utilization.totalBillableHours.toFixed(1)} hours).`);

    const observations: ReportSummaryObservation[] = [
      {
        id: 'revenue',
        text: delta == null ? 'Revenue needs another comparable period before a trend can be calculated.' : `Revenue is ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)}% from the prior ${periodNoun(period)}.`,
        signal: delta == null ? 'neutral' : delta >= 0 ? 'positive' : 'attention',
      },
      {
        id: 'utilization',
        text: `Billable utilization is ${utilization.averageUtilizationPercent.toFixed(0)}%.`,
        signal: utilization.averageUtilizationPercent >= 70 ? 'positive' : 'attention',
      },
    ];
    if (conversionPercent != null) {
      observations.push({
        id: 'conversion',
        text: `${acceptedIntakeCount} of ${intakes.length} intakes were accepted (${conversionPercent}%).`,
        signal: conversionPercent >= 50 ? 'positive' : 'attention',
      });
    }
    if (medianTimeToCloseDays != null) {
      observations.push({
        id: 'time-to-close',
        text: `Median time-to-close is ${Math.round(medianTimeToCloseDays)} days.`,
        signal: 'neutral',
      });
    }

    const grounded = [
      `${revenue.rows.length} period${revenue.rows.length === 1 ? '' : 's'}`,
      `${current?.invoiceCount ?? 0} invoice${current?.invoiceCount === 1 ? '' : 's'}`,
      `${intakes.length} intake${intakes.length === 1 ? '' : 's'}`,
      `${matters.length} matter${matters.length === 1 ? '' : 's'}`,
    ];

    return {
      narrative: narrative.join(' '),
      groundingLabel: `Executive summary · grounded in ${grounded.join(' · ')}`,
      observations,
      revenue: {
        items: revenue.rows,
        totalPaidCents: revenue.totalPaidCents,
        totalOutstandingCents: revenue.totalOutstandingCents,
        totalInvoiceCount: revenue.totalInvoiceCount,
        currentPaidCents: currentPaid,
        currentInvoiceCount: current?.invoiceCount ?? 0,
        priorPaidCents: previous?.paidAmountCents ?? 0,
        deltaPercent: delta,
      },
      utilization: {
        items: utilization.rows,
        totalBillableHours: utilization.totalBillableHours,
        totalNonBillableHours: utilization.totalNonBillableHours,
        averageUtilizationPercent: utilization.averageUtilizationPercent,
      },
      intakes,
      matters,
      conversionPercent,
      acceptedIntakeCount,
      totalIntakeCount: intakes.length,
      medianTimeToCloseDays,
      closedMatterCount: closeDurations.length,
    };
  }
}
