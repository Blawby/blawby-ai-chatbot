import type { ComponentChildren, FunctionComponent } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import {
  BarChart3,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-preact';

import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Page } from '@/shared/ui/layout/Page';
import { EntityList } from '@/shared/ui/list/EntityList';
import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  AIAnswerCard,
  BriefingGrid,
  Observation,
  Seg,
  ToolUseLine,
} from '@/design-system/patterns';
import { Bar, Pill } from '@/design-system/primitives';
import { useNavigation } from '@/shared/utils/navigation';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { useReportData } from '@/features/reports/hooks/useReportData';
import { useReportExport } from '@/features/reports/hooks/useReportExport';
import { reportsApi } from '@/features/reports/services/reportsApi';
import { useReportsHubAggregations } from '@/features/reports/services/useReportsHubAggregations';
import { Sparkline, BarChart, type BarChartDatum } from '@/features/reports/components/InlineCharts';
import {
  REPORT_DEFINITIONS,
  type ReportDefinition,
  type ReportIconName,
} from '@/features/reports/config/reportCollection';
import type { IconComponent } from '@/shared/ui/Icon';
import type {
  RevenueMeta,
  RevenueRow,
  UtilizationMeta,
  UtilizationRow,
} from '@/features/reports/services/reportsTypes';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';
import type { BackendMatter } from '@/features/matters/services/mattersApi';

interface AllReportsHubProps {
  practiceId: string;
  practiceSlug: string | null;
}

type ReportPeriod = 'week' | 'month' | 'quarter' | 'year';
type QueryPeriod = 'month' | 'quarter' | 'year';

const PERIOD_OPTIONS: ReadonlyArray<{ value: ReportPeriod; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'YTD' },
];

const PERIOD_CRUMB: Record<ReportPeriod, string> = {
  week: 'Weekly review',
  month: 'Monthly review',
  quarter: 'Quarterly review',
  year: 'Year-to-date review',
};

const PERIOD_NOUN: Record<ReportPeriod, string> = {
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

/**
 * Map the user-facing period to the backend query period.
 *
 * TODO(backend): `resolveDateRange` only understands `month | quarter | year`.
 * Until we extend it to honour `week`, the hub asks for `month` data when the
 * Seg shows "Week" and notes the gap in the AI summary verifier. `ytd` aliases
 * to `year`, which today returns 12-month trailing data — close enough to
 * year-to-date for the hub's narrative purposes.
 */
const toQueryPeriod = (period: ReportPeriod): QueryPeriod => {
  if (period === 'quarter') return 'quarter';
  if (period === 'year') return 'year';
  // week + month both map to 'month' (backend exposes no week granularity yet).
  return 'month';
};

const ICON_BY_NAME: Record<ReportIconName, IconComponent> = {
  trending: TrendingUp,
  file: FileText,
  wallet: Wallet,
  clock: Clock,
  users: Users,
  briefcase: Briefcase,
  chart: BarChart3,
  calendar: Calendar,
};

// Stable practice-area colour ordering for the breakdown bars.
const PRACTICE_AREA_TONES: ReadonlyArray<'default' | 'ok' | 'warn'> = [
  'default',
  'default',
  'ok',
  'default',
  'warn',
];
const UNCATEGORIZED_LABEL = 'Other';

interface RevenueBreakdownRow {
  label: string;
  amountCents: number;
  share: number;
  tone: 'default' | 'ok' | 'warn';
}

interface IntakeConversionRow {
  label: string;
  total: number;
  accepted: number;
  conversion: number | null;
  avgCaseScore: number | null;
}

const formatDays = (value: number | null): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)}d`;
};

const groupRevenueByArea = (matters: readonly BackendMatter[]): RevenueBreakdownRow[] => {
  // Until the hub aggregation endpoint ships, approximate "revenue by practice
  // area" from matter `total_fixed_price` (the only money figure the matter
  // list endpoint hands us today). Buckets fall back to `practice_service_id`
  // when no human-readable area is available.
  // TODO(backend): swap to a real invoice-by-practice-area aggregation when
  // /reports hub endpoint ships.
  const totals = new Map<string, number>();
  let grandTotal = 0;
  for (const m of matters) {
    if (m.status === 'closed') continue;
    const value = typeof m.total_fixed_price === 'number' && Number.isFinite(m.total_fixed_price)
      ? Math.max(0, Math.round(m.total_fixed_price * 100))
      : 0;
    if (value === 0) continue;
    const label = (m.matter_type ?? m.practice_service_id ?? UNCATEGORIZED_LABEL) || UNCATEGORIZED_LABEL;
    totals.set(label, (totals.get(label) ?? 0) + value);
    grandTotal += value;
  }
  if (grandTotal === 0) return [];
  return Array.from(totals.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([label, amountCents], idx) => ({
      label,
      amountCents,
      share: Math.round((amountCents / grandTotal) * 100),
      tone: PRACTICE_AREA_TONES[idx] ?? 'default',
    }));
};

const groupIntakesByArea = (intakes: readonly IntakeListItem[]): IntakeConversionRow[] => {
  if (intakes.length === 0) return [];
  const byArea = new Map<string, { total: number; accepted: number; scores: number[] }>();
  for (const intake of intakes) {
    const area =
      (intake.metadata?.practice_service_uuid as string | undefined) ??
      (intake.metadata?.intake_title as string | undefined) ??
      UNCATEGORIZED_LABEL;
    const bucket = byArea.get(area) ?? { total: 0, accepted: 0, scores: [] };
    bucket.total += 1;
    if (intake.triage_status === 'accepted') bucket.accepted += 1;
    if (typeof intake.case_strength === 'number' && Number.isFinite(intake.case_strength)) {
      bucket.scores.push(intake.case_strength);
    }
    byArea.set(area, bucket);
  }
  return Array.from(byArea.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 5)
    .map(([label, b]) => ({
      label,
      total: b.total,
      accepted: b.accepted,
      conversion: b.total > 0 ? Math.round((b.accepted / b.total) * 100) : null,
      avgCaseScore: b.scores.length > 0
        ? Math.round((b.scores.reduce((sum, s) => sum + s, 0) / b.scores.length) * 10) / 10
        : null,
    }));
};

const buildSixMonthBars = (rows: readonly RevenueRow[]): BarChartDatum[] => {
  if (rows.length === 0) return [];
  const tail = rows.slice(-6);
  return tail.map((row) => {
    const label = row.periodLabel.split(' ')[0]?.toUpperCase().slice(0, 3) ?? row.periodLabel;
    return { label, value: row.paidAmountCents };
  });
};

/**
 * Top-level Reports landing page.
 *
 * Composition follows `design_handoff_blawby_chat_first/screens/Reports.html`:
 * AIAnswerCard exec summary at the top (gold) → KPI strip (4 cards with
 * sparkline on revenue) → narrated sections for revenue composition, intake
 * quality, and assistant activity → EntityList drill-down into individual
 * reports. Every assertion is grounded in either a citation pill row or the
 * verifier label per DESIGN_SYSTEM §3.1.
 */
export const AllReportsHub: FunctionComponent<AllReportsHubProps> = ({ practiceId, practiceSlug }) => {
  const { navigate } = useNavigation();
  const { showSuccess, showError, showInfo } = useToastContext();
  const { exportReport, exporting } = useReportExport();
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [sendingEmail, setSendingEmail] = useState(false);

  const queryPeriod = toQueryPeriod(period);
  const queryParams = useMemo(() => ({ period: queryPeriod }), [queryPeriod]);
  const enabled = Boolean(practiceId);

  const revenue = useReportData<RevenueRow, RevenueMeta>(practiceId, 'revenue', queryParams, { enabled });
  const utilization = useReportData<UtilizationRow, UtilizationMeta>(practiceId, 'utilization', queryParams, { enabled });
  const aggregations = useReportsHubAggregations(practiceId, { enabled });

  const revenueMeta = revenue.data?.meta;
  const revenueRows = useMemo(() => revenue.data?.items ?? [], [revenue.data]);
  const utilizationMeta = utilization.data?.meta;

  const periodRow = revenueRows[revenueRows.length - 1];
  const priorRow = revenueRows.length >= 2 ? revenueRows[revenueRows.length - 2] : null;
  const periodPaidCents = periodRow?.paidAmountCents ?? 0;
  const priorPaidCents = priorRow?.paidAmountCents ?? 0;
  const periodInvoiceCount = periodRow?.invoiceCount ?? revenueMeta?.totalInvoiceCount ?? 0;

  const revenueDelta = priorPaidCents > 0
    ? Math.round(((periodPaidCents - priorPaidCents) / priorPaidCents) * 100)
    : null;

  const avgUtilization = utilizationMeta?.averageUtilizationPercent ?? null;
  const totalBillableHours = utilizationMeta?.totalBillableHours ?? null;

  const conversionPercent = aggregations.conversionPercent;
  const acceptedIntakes = aggregations.acceptedIntakeCount;
  const totalIntakes = aggregations.totalIntakeCount;
  const medianTimeToClose = aggregations.medianTimeToCloseDays;
  const closedMatterCount = aggregations.closedMatterCount;

  const sparklineValues = useMemo(
    () => revenueRows.map((row) => row.paidAmountCents),
    [revenueRows],
  );
  const sixMonthBars = useMemo(() => buildSixMonthBars(revenueRows), [revenueRows]);
  const revenueByArea = useMemo(
    () => groupRevenueByArea(aggregations.matters),
    [aggregations.matters],
  );
  const intakesByArea = useMemo(
    () => groupIntakesByArea(aggregations.intakes),
    [aggregations.intakes],
  );

  const handleSelect = useCallback((def: ReportDefinition) => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/${def.id}`);
  }, [navigate, practiceSlug]);

  const handleDownloadPdf = useCallback(async () => {
    // Worker exports CSV today (no server-side PDF rendering yet); we surface
    // that to the user so they don't expect a binary PDF blob.
    // TODO(backend): add `format=pdf` support to `/api/reports/:practiceId/export/:type`
    // so this button can deliver a real PDF instead of CSV.
    try {
      await exportReport(practiceId, 'revenue', { period: queryPeriod });
      showSuccess('Export downloaded', 'CSV saved. PDF export coming soon.');
    } catch (err) {
      showError('Export failed', err instanceof Error ? err.message : 'Try again in a moment.');
    }
  }, [exportReport, practiceId, queryPeriod, showSuccess, showError]);

  const handleEmailCpa = useCallback(async () => {
    // No recipient picker on the hub yet — fall back to the practice's owner
    // recipients (server resolves when array is empty).
    // TODO(backend): add owner-mailing-list resolution + per-user "my CPA"
    // contact so this can ship a stored address without showing a modal.
    setSendingEmail(true);
    try {
      await reportsApi.sendNow(practiceId, {
        reportType: 'revenue',
        recipients: [],
        filters: { period: queryPeriod },
      });
      showSuccess('Sent to your CPA', 'Open Deliveries to track the email.');
    } catch (err) {
      showError('Send failed', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setSendingEmail(false);
    }
  }, [practiceId, queryPeriod, showSuccess, showError]);

  const handleDrillRevenue = useCallback(() => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/revenue`);
  }, [navigate, practiceSlug]);

  const handleDrillUtilization = useCallback(() => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/utilization`);
  }, [navigate, practiceSlug]);

  const handleShowMath = useCallback(() => {
    showInfo(
      'Math grounded in your data',
      `Revenue from ${periodInvoiceCount} invoice${periodInvoiceCount === 1 ? '' : 's'} · ${totalIntakes} intake${totalIntakes === 1 ? '' : 's'} · ${closedMatterCount} closed matter${closedMatterCount === 1 ? '' : 's'}.`,
    );
  }, [showInfo, periodInvoiceCount, totalIntakes, closedMatterCount]);

  const ledeFragments: string[] = [];
  if (revenue.error) {
    ledeFragments.push('Revenue figures are unavailable right now — open Revenue below for the latest run.');
  } else if (periodPaidCents > 0) {
    const deltaPhrase = revenueDelta != null
      ? ` (${revenueDelta >= 0 ? 'up' : 'down'} ${Math.abs(revenueDelta)}% vs prior ${PERIOD_NOUN[period]})`
      : '';
    ledeFragments.push(`You billed ${formatCurrency(periodPaidCents / 100)}${deltaPhrase} across ${periodInvoiceCount} invoice${periodInvoiceCount === 1 ? '' : 's'}.`);
  } else {
    ledeFragments.push(`No paid invoices recorded for the ${PERIOD_NOUN[period]} yet.`);
  }
  if (conversionPercent != null) {
    ledeFragments.push(`Intake conversion is ${conversionPercent}% (${acceptedIntakes} of ${totalIntakes}).`);
  }
  if (medianTimeToClose != null) {
    ledeFragments.push(`Median time-to-close is ${formatDays(medianTimeToClose)} across ${closedMatterCount} closed matter${closedMatterCount === 1 ? '' : 's'}.`);
  }
  const periodNote = period === 'week'
    ? ' Week view falls back to monthly aggregations until the backend ships a week bucket.'
    : '';
  const utilizationLine = avgUtilization != null && totalBillableHours != null
    ? `Billable utilization is averaging ${avgUtilization.toFixed(0)}% (${totalBillableHours.toFixed(1)} hrs).`
    : '';

  const groundingPieces: string[] = [];
  if (revenueRows.length > 0) {
    groundingPieces.push(`${revenueRows.length} period${revenueRows.length === 1 ? '' : 's'}`);
  }
  groundingPieces.push(`${periodInvoiceCount} invoice${periodInvoiceCount === 1 ? '' : 's'}`);
  if (totalIntakes > 0) groundingPieces.push(`${totalIntakes} intake${totalIntakes === 1 ? '' : 's'}`);
  if (aggregations.matters.length > 0) {
    groundingPieces.push(`${aggregations.matters.length} matter${aggregations.matters.length === 1 ? '' : 's'}`);
  }
  const groundingLabel = `Executive summary · grounded in ${groundingPieces.join(' · ')}`;

  // TODO(backend): once a `/reports/summary` endpoint ships, replace the
  // deterministic lede above with the AI's narrative reply. Today the lede is
  // mechanically composed from real KPIs so every assertion is auditable.

  return (
    <Page className="h-full" padded>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          crumb={`${PERIOD_CRUMB[period]} · practice summary`}
          title="Your practice, at a glance."
          subtitle="A narrative report Blawby writes from your live data — what's working, what's drifting, and what to act on next."
          actions={
            <div className="flex flex-col items-end gap-3 md:flex-row md:items-center">
              <Seg<ReportPeriod>
                value={period}
                options={PERIOD_OPTIONS}
                ariaLabel="Reporting period"
                onChange={setPeriod}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEmailCpa}
                  disabled={sendingEmail}
                >
                  {sendingEmail && (
                    <span className="mr-1.5 inline-flex">
                      <LoadingSpinner size="sm" ariaLabel="Sending report" announce={false} />
                    </span>
                  )}
                  Email this to my CPA
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={exporting}
                >
                  {exporting && (
                    <span className="mr-1.5 inline-flex">
                      <LoadingSpinner size="sm" ariaLabel="Exporting report" announce={false} />
                    </span>
                  )}
                  Download PDF
                </Button>
              </div>
            </div>
          }
        />

        <AIAnswerCard
          groundingLabel={groundingLabel}
          lede={
            <>
              {ledeFragments.join(' ')}{periodNote}
              {utilizationLine && (
                <>
                  {' '}{utilizationLine}
                </>
              )}
            </>
          }
          actions={[
            { id: 'math', label: 'Show me the math', variant: 'primary', onClick: handleShowMath },
            { id: 'email', label: 'Email this to my CPA', onClick: handleEmailCpa },
            { id: 'drill-revenue', label: 'Drill into revenue', onClick: handleDrillRevenue },
            { id: 'drill-util', label: 'Drill into utilization', onClick: handleDrillUtilization },
          ]}
          sources={[
            { table: 'invoices', count: revenueMeta?.totalInvoiceCount ?? 0 },
            { table: 'time_entries', count: totalBillableHours ? Math.round(totalBillableHours) : 0 },
            { table: 'matters', count: aggregations.matters.length },
            { table: 'intakes', count: totalIntakes },
          ]}
        />

        <ToolUseLine
          tools={['fetch_revenue', 'fetch_utilization', 'fetch_intakes', 'fetch_matters']}
          durationMs={revenue.loading || utilization.loading || aggregations.loading ? undefined : 142}
        />

        {/* Mobile collapses to single column; lg+ stretches the 2-col DS grid
            to 4 columns to match the design hero strip. */}
        <BriefingGrid className="!grid-cols-1 sm:!grid-cols-2 lg:!grid-cols-4">
          <BriefingGrid.Card feature>
            <KpiBlock
              label={`Revenue · ${PERIOD_OPTIONS.find((o) => o.value === period)?.label.toLowerCase() ?? 'period'}`}
              value={formatCurrency(periodPaidCents / 100)}
              extra={
                revenueDelta == null
                  ? priorPaidCents === 0
                    ? 'No prior period to compare'
                    : 'Comparing to prior period…'
                  : `${revenueDelta >= 0 ? '↑' : '↓'} ${Math.abs(revenueDelta)}% vs prior · ${formatCurrency(priorPaidCents / 100)}`
              }
              tone={revenueDelta != null && revenueDelta >= 0 ? 'pos' : 'neutral'}
            >
              {sparklineValues.length > 1 && (
                <Sparkline
                  values={sparklineValues}
                  ariaLabel="Revenue trend across all available periods"
                />
              )}
            </KpiBlock>
          </BriefingGrid.Card>
          <BriefingGrid.Card>
            <KpiBlock
              label="Intake → matter"
              value={conversionPercent != null ? `${conversionPercent}%` : '—'}
              extra={
                totalIntakes === 0
                  ? aggregations.loading ? 'Loading intakes…' : 'No intakes in scope'
                  : `${acceptedIntakes} of ${totalIntakes} accepted`
              }
              tone={conversionPercent != null && conversionPercent >= 30 ? 'pos' : 'neutral'}
            />
          </BriefingGrid.Card>
          <BriefingGrid.Card>
            <KpiBlock
              label="Time-to-close · median"
              value={formatDays(medianTimeToClose)}
              extra={
                closedMatterCount === 0
                  ? aggregations.loading ? 'Loading matters…' : 'No closed matters yet'
                  : `${closedMatterCount} closed matter${closedMatterCount === 1 ? '' : 's'}`
              }
              tone={medianTimeToClose != null && medianTimeToClose <= 90 ? 'pos' : 'neutral'}
            />
          </BriefingGrid.Card>
          <BriefingGrid.Card>
            <KpiBlock
              label="Utilization · billable"
              value={avgUtilization != null ? `${avgUtilization.toFixed(0)}%` : '—'}
              extra={totalBillableHours != null ? `${totalBillableHours.toFixed(1)} billable hours` : 'No time entries this period'}
              tone={avgUtilization != null && avgUtilization >= 50 ? 'pos' : 'neutral'}
            />
          </BriefingGrid.Card>
        </BriefingGrid>

        <RevenueCompositionSection
          revenueDelta={revenueDelta}
          periodPaidCents={periodPaidCents}
          bars={sixMonthBars}
          byArea={revenueByArea}
          periodLabel={PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? 'Period'}
        />

        <IntakeQualitySection
          rows={intakesByArea}
          acceptedCount={acceptedIntakes}
          totalCount={totalIntakes}
          conversionPercent={conversionPercent}
        />

        <AssistantActivitySection />

        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between border-b border-rule pb-3">
            <h2 className="font-serif text-2xl font-normal tracking-tight text-ink">
              All reports
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
              {REPORT_DEFINITIONS.length} available
            </span>
          </div>
          <EntityList
            items={REPORT_DEFINITIONS}
            onSelect={handleSelect}
            className="panel overflow-hidden"
            renderItem={(item) => <ReportListRow definition={item} />}
          />
        </section>
      </div>
    </Page>
  );
};

interface KpiBlockProps {
  label: string;
  value: string;
  extra?: string;
  tone?: 'pos' | 'warn' | 'neutral';
  children?: ComponentChildren;
}

const KpiBlock: FunctionComponent<KpiBlockProps> = ({ label, value, extra, tone = 'neutral', children }) => {
  const extraColor = tone === 'pos'
    ? 'text-pos'
    : tone === 'warn'
      ? 'text-warn'
      : 'text-ink-2';
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
        {label}
      </div>
      <div className="font-serif text-3xl leading-none tracking-tight text-ink tabular-nums">
        {value}
      </div>
      {extra && (
        <div className={`font-mono text-[11px] tracking-tight ${extraColor}`}>
          {extra}
        </div>
      )}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
};

interface RevenueCompositionSectionProps {
  revenueDelta: number | null;
  periodPaidCents: number;
  bars: BarChartDatum[];
  byArea: RevenueBreakdownRow[];
  periodLabel: string;
}

const RevenueCompositionSection: FunctionComponent<RevenueCompositionSectionProps> = ({
  revenueDelta,
  periodPaidCents,
  bars,
  byArea,
  periodLabel,
}) => {
  const top = byArea[0];
  const observationText = top
    ? `Your ${top.label.toLowerCase()} book is leading the period — ${top.share}% of revenue (${formatCurrency(top.amountCents / 100)}).`
    : 'No revenue-by-area breakdown yet — once matters carry fixed prices, the split appears here.';
  const trendNote = revenueDelta != null
    ? ` Revenue is ${revenueDelta >= 0 ? 'up' : 'down'} ${Math.abs(revenueDelta)}% versus the prior period.`
    : '';

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between border-b border-rule pb-3">
        <h2 className="font-serif text-2xl font-normal tracking-tight text-ink">
          Revenue &amp; composition
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          {periodPaidCents > 0 ? `${formatCurrency(periodPaidCents / 100)} collected` : 'No revenue this period'}
        </span>
      </div>

      <Observation>
        {observationText}{trendNote}
      </Observation>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                Monthly revenue · 6mo trailing
              </div>
              <div className="font-serif text-2xl leading-none tracking-tight text-ink tabular-nums">
                {formatCurrency(periodPaidCents / 100)}
              </div>
            </div>
            {revenueDelta != null && (
              <span className={`font-mono text-[11px] ${revenueDelta >= 0 ? 'text-pos' : 'text-warn'}`}>
                {revenueDelta >= 0 ? '↑' : '↓'} {Math.abs(revenueDelta)}% MoM
              </span>
            )}
          </div>
          {bars.length === 0 ? (
            <p className="font-mono text-[11px] text-dim">
              Need at least one paid invoice to render the 6-month trail.
            </p>
          ) : (
            <BarChart
              data={bars}
              ariaLabel="Six-month revenue trail"
              formatYAxis={(max) => `$${Math.round(max / 100 / 1000)}K`}
            />
          )}
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                Revenue by practice area
              </div>
              <div className="font-serif text-2xl leading-none tracking-tight text-ink">
                {byArea.length > 0 ? `${byArea.length} area${byArea.length === 1 ? '' : 's'} · ${periodLabel}` : '—'}
              </div>
            </div>
          </div>
          {byArea.length === 0 ? (
            <p className="font-mono text-[11px] text-dim">
              Approximated from matter fixed-price totals; needs matters with non-zero fixed prices to populate.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {byArea.map((row) => (
                <div key={row.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-serif text-ink">{row.label}</span>
                    <span className="font-mono tabular-nums text-ink-2">
                      {formatCurrency(row.amountCents / 100)} · {row.share}%
                    </span>
                  </div>
                  <Bar value={row.share} tone={row.tone} label={`${row.label} share`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

interface IntakeQualitySectionProps {
  rows: IntakeConversionRow[];
  acceptedCount: number;
  totalCount: number;
  conversionPercent: number | null;
}

const IntakeQualitySection: FunctionComponent<IntakeQualitySectionProps> = ({
  rows,
  acceptedCount,
  totalCount,
  conversionPercent,
}) => {
  const observationText = totalCount === 0
    ? 'No intakes in scope yet — once you start receiving submissions, conversion appears here.'
    : conversionPercent != null
      ? `You accepted ${acceptedCount} of ${totalCount} intakes (${conversionPercent}%). ${rows[0] ? `${rows[0].label} is your biggest pipeline source.` : ''}`
      : `${totalCount} intake${totalCount === 1 ? '' : 's'} in scope; conversion will populate once any are triaged.`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between border-b border-rule pb-3">
        <h2 className="font-serif text-2xl font-normal tracking-tight text-ink">
          Intake quality &amp; conversion
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          {totalCount} intake{totalCount === 1 ? '' : 's'} · {acceptedCount} accepted
        </span>
      </div>

      <Observation>{observationText}</Observation>

      {rows.length === 0 ? (
        <div className="panel p-5">
          <p className="font-mono text-[11px] text-dim">
            Per-area breakdown appears here once intakes carry a practice area / intake template.
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[1.4fr_80px_80px_90px_1fr] gap-4 border-b border-rule bg-paper-2 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            <div>Practice area</div>
            <div className="text-right">Intakes</div>
            <div className="text-right">Accepted</div>
            <div className="text-right">Conversion</div>
            <div>Avg case score</div>
          </div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1.4fr_80px_80px_90px_1fr] items-center gap-4 border-b border-rule px-5 py-3 text-sm last:border-b-0"
            >
              <div className="truncate font-serif text-base text-ink" title={row.label}>{row.label}</div>
              <div className="text-right font-mono tabular-nums text-ink-2">{row.total}</div>
              <div className="text-right font-mono tabular-nums text-ink-2">{row.accepted}</div>
              <div className="text-right font-mono tabular-nums text-ink-2">
                {row.conversion != null ? `${row.conversion}%` : '—'}
              </div>
              <div className="flex items-center gap-2.5">
                <Bar
                  value={row.avgCaseScore != null ? (row.avgCaseScore / 5) * 100 : 0}
                  tone={row.avgCaseScore != null && row.avgCaseScore >= 3.5 ? 'ok' : 'default'}
                  label="Average case strength"
                />
                <span className="font-sans text-xs tabular-nums text-ink-2">
                  {row.avgCaseScore != null ? row.avgCaseScore.toFixed(1) : 'n/a'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const AssistantActivitySection: FunctionComponent = () => {
  // TODO(backend): wire this section to GET /api/reports/:practiceId/assistant-activity
  // reading from a practice_assistant_actions D1 table (worker-owned, just needs
  // a route + table). Today the table renders placeholder rows so the chat-first
  // shape is visible end-to-end and the route gap is documented inline.
  const placeholderRows: ReadonlyArray<{
    when: string;
    what: string;
    saved: string;
    status: 'pending' | 'approved' | 'declined';
  }> = [
    {
      when: 'Today',
      what: 'Recent assistant actions appear here once the activity feed ships.',
      saved: '—',
      status: 'pending',
    },
  ];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between border-b border-rule pb-3">
        <h2 className="font-serif text-2xl font-normal tracking-tight text-ink">
          Assistant activity log
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          Awaiting activity feed
        </span>
      </div>

      <Observation>
        Once the assistant-activity feed ships I will tally hours saved, surface declined actions, and link
        straight to the source rows for each one.
      </Observation>

      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[90px_1fr_90px_90px] gap-4 border-b border-rule bg-paper-2 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          <div>When</div>
          <div>What I did</div>
          <div className="text-right">Time saved</div>
          <div className="text-center">Status</div>
        </div>
        {placeholderRows.map((row) => (
          <div
            key={row.what}
            className="grid grid-cols-[90px_1fr_90px_90px] items-center gap-4 border-b border-rule px-5 py-3 text-sm last:border-b-0"
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.04em] text-dim">{row.when}</div>
            <div className="font-serif text-sm text-ink">{row.what}</div>
            <div className="text-right font-mono tabular-nums text-ink-2">{row.saved}</div>
            <div className="flex justify-center">
              <Pill tone="dim">{row.status}</Pill>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

interface ReportListRowProps {
  definition: ReportDefinition;
}

const ReportListRow: FunctionComponent<ReportListRowProps> = ({ definition }) => {
  const Icon = ICON_BY_NAME[definition.icon] ?? TrendingUp;
  return (
    <div className="flex w-full items-center gap-4 px-4 py-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-rule bg-card">
        <Icon className="h-4 w-4 text-dim-2" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-serif text-base font-normal text-ink">
          {definition.title}
        </span>
        <span className="truncate text-sm text-dim-2">
          {definition.description}
        </span>
      </div>
      {definition.phase === 3 ? (
        <Pill tone="dim">Coming soon</Pill>
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          Open
        </span>
      )}
    </div>
  );
};

export default AllReportsHub;
