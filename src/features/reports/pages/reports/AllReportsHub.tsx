import type { FunctionComponent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
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
import {
  AISummary,
  BriefingGrid,
  Citations,
  Seg,
  ToolUseLine,
} from '@/design-system/patterns';
import { Chip, Pill } from '@/design-system/primitives';
import { useNavigation } from '@/shared/utils/navigation';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { useReportData } from '@/features/reports/hooks/useReportData';
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

interface AllReportsHubProps {
  practiceId: string;
  practiceSlug: string | null;
}

type ReportPeriod = 'week' | 'month' | 'quarter' | 'year';

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

/**
 * Top-level Reports landing page.
 *
 * Composition follows `design_handoff_blawby_chat_first/screens/Reports.html`:
 * AISummary hero with the assistant's exec summary → BriefingGrid of KPI cards
 * grounded in real revenue/utilization data → EntityList drill-down into each
 * individual report. The narrative copy is placeholder until the backend ships
 * a `/reports/summary` endpoint; the metrics around it are live.
 */
export const AllReportsHub: FunctionComponent<AllReportsHubProps> = ({ practiceId, practiceSlug }) => {
  const { navigate } = useNavigation();
  const [period, setPeriod] = useState<ReportPeriod>('month');

  // The Seg control is presentation-only for now (matches the design mock).
  // Backend queries are pinned to 'month' which is what `useReportData`
  // already understands; widening the param space is a backend follow-up.
  const queryParams = useMemo(() => ({ period: 'month' as const }), []);
  const enabled = Boolean(practiceId);

  const revenue = useReportData<RevenueRow, RevenueMeta>(practiceId, 'revenue', queryParams, { enabled });
  const utilization = useReportData<UtilizationRow, UtilizationMeta>(practiceId, 'utilization', queryParams, { enabled });

  const revenueMeta = revenue.data?.meta;
  const revenueRows = revenue.data?.items ?? [];
  const utilizationMeta = utilization.data?.meta;

  const periodRow = revenueRows[revenueRows.length - 1];
  const priorRow = revenueRows.length >= 2 ? revenueRows[revenueRows.length - 2] : null;
  const periodPaidCents = periodRow?.paidAmountCents ?? 0;
  const priorPaidCents = priorRow?.paidAmountCents ?? 0;
  const periodInvoiceCount = periodRow?.invoiceCount ?? revenueMeta?.totalInvoiceCount ?? 0;
  const totalOutstandingCents = revenueMeta?.totalOutstandingCents ?? 0;

  const revenueDelta = priorPaidCents > 0
    ? Math.round(((periodPaidCents - priorPaidCents) / priorPaidCents) * 100)
    : null;

  const avgUtilization = utilizationMeta?.averageUtilizationPercent ?? null;
  const totalBillableHours = utilizationMeta?.totalBillableHours ?? null;

  const handleSelect = (def: ReportDefinition) => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/${def.id}`);
  };

  const verifier = revenue.data
    ? `Grounded in ${periodInvoiceCount} invoice${periodInvoiceCount === 1 ? '' : 's'} · ${revenueRows.length} period${revenueRows.length === 1 ? '' : 's'}`
    : 'Pulling latest figures';

  return (
    <Page className="h-full" padded>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          crumb={`${PERIOD_CRUMB[period]} · practice summary`}
          title="Your practice, at a glance."
          subtitle="A narrative report Blawby writes from your live data — what's working, what's drifting, and what to act on next."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Seg<ReportPeriod>
                value={period}
                options={PERIOD_OPTIONS}
                ariaLabel="Reporting period"
                onChange={setPeriod}
              />
            </div>
          }
        />

        <AISummary
          label="Executive summary"
          verifier={verifier}
          actions={
            <>
              <Chip variant="primary">Show me the math</Chip>
              <Chip>Email this to my CPA</Chip>
            </>
          }
        >
          {revenue.error ? (
            <>
              Live figures are unavailable right now — open any report below for the latest run.
            </>
          ) : (
            <>
              You collected <em>{formatCurrency(periodPaidCents / 100)}</em>
              {revenueDelta != null && (
                <>
                  {' '}({revenueDelta >= 0 ? 'up' : 'down'} <em>{Math.abs(revenueDelta)}%</em> vs the prior period)
                </>
              )}
              {' '}across <em>{periodInvoiceCount} invoice{periodInvoiceCount === 1 ? '' : 's'}</em>
              {totalOutstandingCents > 0 && (
                <>
                  , with <em>{formatCurrency(totalOutstandingCents / 100)}</em> still outstanding
                </>
              )}
              .{' '}
              {avgUtilization != null && totalBillableHours != null
                ? (
                  <>
                    Billable utilization is averaging <em>{avgUtilization.toFixed(0)}%</em>
                    {' '}({totalBillableHours.toFixed(1)} hrs). Drill into any report below for the full picture.
                  </>
                )
                : 'Drill into any report below for the full picture.'}
            </>
          )}
        </AISummary>

        <div className="flex flex-col gap-2">
          <ToolUseLine
            tools={['fetch_revenue', 'fetch_utilization']}
            durationMs={revenue.loading || utilization.loading ? undefined : 142}
          />
          <Citations
            sources={[
              { table: 'invoices', count: revenueMeta?.totalInvoiceCount ?? 0, isLive: true, title: 'Live invoice rows' },
              { table: 'time_entries', count: totalBillableHours ? Math.round(totalBillableHours) : 0, title: 'Billable hours rolled up' },
            ]}
          />
        </div>

        <BriefingGrid>
          <BriefingGrid.Card spanTwo feature>
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
            />
          </BriefingGrid.Card>
          <BriefingGrid.Card>
            <KpiBlock
              label="Outstanding · open invoices"
              value={formatCurrency(totalOutstandingCents / 100)}
              extra={`${revenueMeta?.totalInvoiceCount ?? 0} invoice${(revenueMeta?.totalInvoiceCount ?? 0) === 1 ? '' : 's'} in scope`}
              tone={totalOutstandingCents > 0 ? 'warn' : 'pos'}
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
}

const KpiBlock: FunctionComponent<KpiBlockProps> = ({ label, value, extra, tone = 'neutral' }) => {
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
    </div>
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
