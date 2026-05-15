/**
 * Single source of truth for the legal-firm reports system.
 *
 * Adding a new report = one entry in REPORT_DEFINITIONS.
 * Nav, hub, page, CSV columns, filters, KPI cards all pick it up.
 */

export type ReportPhase = 1 | 2 | 3;

export type ReportId =
  | 'revenue'
  | 'aging'
  | 'profitability'
  | 'utilization'
  | 'trust-ledger'
  | 'wip'
  | 'originating-attorney'
  | 'matters-by-attorney'
  | 'task-productivity';

export type ReportIconName =
  | 'trending'
  | 'file'
  | 'wallet'
  | 'clock'
  | 'users'
  | 'briefcase'
  | 'chart'
  | 'calendar';

export type FilterSpec =
  | { id: string; label: string; kind: 'period'; defaultValue?: 'month' | 'quarter' | 'year' }
  | { id: string; label: string; kind: 'date-range' }
  | { id: string; label: string; kind: 'text'; placeholder?: string }
  | { id: string; label: string; kind: 'number'; placeholder?: string; min?: number; max?: number }
  | { id: string; label: string; kind: 'select'; options: Array<{ value: string; label: string }>; defaultValue?: string };

export type ColumnKind =
  | 'text'
  | 'money'
  | 'percent'
  | 'date'
  | 'number'
  | 'days'
  | 'hours';

export interface ColumnSpec {
  key: string;
  label: string;
  kind: ColumnKind;
  align?: 'left' | 'center' | 'right';
  hideAt?: 'sm' | 'md' | 'lg';
  isPrimary?: boolean;
}

export interface SummaryCardSpec {
  id: string;
  label: string;
  kind: ColumnKind;
  metaKey: string;
}

export interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  icon: ReportIconName;
  phase: ReportPhase;
  defaultPeriod?: 'month' | 'quarter' | 'year';
  filters: FilterSpec[];
  columns: ColumnSpec[];
  summaryCards?: SummaryCardSpec[];
}

const PERIOD_FILTER: FilterSpec = {
  id: 'period',
  label: 'Period',
  kind: 'period',
  defaultValue: 'month',
};

const DATE_RANGE_FILTER: FilterSpec = {
  id: 'dateRange',
  label: 'Date range',
  kind: 'date-range',
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'revenue',
    title: 'Revenue',
    description: 'Paid invoice revenue grouped by period.',
    icon: 'trending',
    phase: 1,
    defaultPeriod: 'month',
    filters: [PERIOD_FILTER, DATE_RANGE_FILTER],
    columns: [
      { key: 'periodLabel', label: 'Period', kind: 'text', isPrimary: true },
      { key: 'invoiceCount', label: 'Invoices', kind: 'number', align: 'right' },
      { key: 'paidAmountCents', label: 'Paid', kind: 'money', align: 'right' },
      { key: 'outstandingAmountCents', label: 'Outstanding', kind: 'money', align: 'right' },
    ],
    summaryCards: [
      { id: 'totalPaid', label: 'Paid (period)', kind: 'money', metaKey: 'totalPaidCents' },
      { id: 'totalOutstanding', label: 'Outstanding (period)', kind: 'money', metaKey: 'totalOutstandingCents' },
      { id: 'invoiceCount', label: 'Invoices (period)', kind: 'number', metaKey: 'totalInvoiceCount' },
    ],
  },
  {
    id: 'aging',
    title: 'Accounts Receivable Aging',
    description: 'Unpaid invoices grouped by days overdue.',
    icon: 'wallet',
    phase: 1,
    filters: [DATE_RANGE_FILTER],
    columns: [
      { key: 'bucketLabel', label: 'Bucket', kind: 'text', isPrimary: true },
      { key: 'invoiceCount', label: 'Invoices', kind: 'number', align: 'right' },
      { key: 'totalAmountCents', label: 'Amount', kind: 'money', align: 'right' },
    ],
    summaryCards: [
      { id: 'totalOutstanding', label: 'Total outstanding', kind: 'money', metaKey: 'totalOutstandingCents' },
      { id: 'totalInvoices', label: 'Open invoices', kind: 'number', metaKey: 'totalInvoiceCount' },
    ],
  },
  {
    id: 'profitability',
    title: 'Matter Profitability',
    description: 'Revenue minus estimated cost per matter.',
    icon: 'briefcase',
    phase: 2,
    filters: [
      DATE_RANGE_FILTER,
      { id: 'hourlyRate', label: 'Override hourly rate', kind: 'number', placeholder: 'e.g. 250', min: 0 },
    ],
    columns: [
      { key: 'matterTitle', label: 'Matter', kind: 'text', isPrimary: true },
      { key: 'revenueCents', label: 'Revenue', kind: 'money', align: 'right' },
      { key: 'estimatedCostCents', label: 'Est. cost', kind: 'money', align: 'right' },
      { key: 'marginCents', label: 'Margin', kind: 'money', align: 'right' },
      { key: 'billableHours', label: 'Billable hrs', kind: 'hours', align: 'right' },
    ],
    summaryCards: [
      { id: 'totalRevenue', label: 'Total revenue', kind: 'money', metaKey: 'totalRevenueCents' },
      { id: 'totalCost', label: 'Total est. cost', kind: 'money', metaKey: 'totalCostCents' },
      { id: 'totalMargin', label: 'Total margin', kind: 'money', metaKey: 'totalMarginCents' },
    ],
  },
  {
    id: 'utilization',
    title: 'Attorney Utilization',
    description: 'Billable share of tracked time, by user.',
    icon: 'clock',
    phase: 2,
    filters: [DATE_RANGE_FILTER],
    columns: [
      { key: 'userId', label: 'User', kind: 'text', isPrimary: true },
      { key: 'billableHours', label: 'Billable', kind: 'hours', align: 'right' },
      { key: 'nonBillableHours', label: 'Non-billable', kind: 'hours', align: 'right' },
      { key: 'totalHours', label: 'Total', kind: 'hours', align: 'right' },
      { key: 'utilizationPercent', label: 'Utilization', kind: 'percent', align: 'right' },
    ],
    summaryCards: [
      { id: 'totalBillable', label: 'Total billable hrs', kind: 'hours', metaKey: 'totalBillableHours' },
      { id: 'avgUtilization', label: 'Avg utilization', kind: 'percent', metaKey: 'averageUtilizationPercent' },
    ],
  },
  {
    id: 'trust-ledger',
    title: 'Trust Ledger',
    description: 'Trust account transactions and balances.',
    icon: 'wallet',
    phase: 3,
    filters: [DATE_RANGE_FILTER],
    columns: [
      { key: 'occurredAt', label: 'Date', kind: 'date', isPrimary: true },
      { key: 'clientName', label: 'Client', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'text', hideAt: 'sm' },
      { key: 'amountCents', label: 'Amount', kind: 'money', align: 'right' },
      { key: 'balanceCents', label: 'Balance', kind: 'money', align: 'right' },
    ],
  },
  {
    id: 'wip',
    title: 'Work in Progress',
    description: 'Unbilled time and expenses by matter.',
    icon: 'clock',
    phase: 3,
    filters: [DATE_RANGE_FILTER],
    columns: [
      { key: 'matterTitle', label: 'Matter', kind: 'text', isPrimary: true },
      { key: 'unbilledHours', label: 'Unbilled hrs', kind: 'hours', align: 'right' },
      { key: 'unbilledAmountCents', label: 'Unbilled amount', kind: 'money', align: 'right' },
    ],
  },
  {
    id: 'originating-attorney',
    title: 'Originating Attorney',
    description: 'Revenue and matters attributed to each originating attorney.',
    icon: 'users',
    phase: 3,
    filters: [DATE_RANGE_FILTER],
    columns: [
      { key: 'attorneyName', label: 'Attorney', kind: 'text', isPrimary: true },
      { key: 'matterCount', label: 'Matters', kind: 'number', align: 'right' },
      { key: 'revenueCents', label: 'Revenue', kind: 'money', align: 'right' },
    ],
  },
  {
    id: 'matters-by-attorney',
    title: 'Matters by Attorney',
    description: 'Matter counts and status by responsible attorney.',
    icon: 'users',
    phase: 3,
    filters: [DATE_RANGE_FILTER],
    columns: [
      { key: 'attorneyName', label: 'Attorney', kind: 'text', isPrimary: true },
      { key: 'matterCount', label: 'Matters', kind: 'number', align: 'right' },
      { key: 'openCount', label: 'Open', kind: 'number', align: 'right' },
      { key: 'closedCount', label: 'Closed', kind: 'number', align: 'right' },
    ],
  },
  {
    id: 'task-productivity',
    title: 'Task Productivity',
    description: 'Completed task counts and cycle time.',
    icon: 'chart',
    phase: 3,
    filters: [DATE_RANGE_FILTER],
    columns: [
      { key: 'assigneeName', label: 'Assignee', kind: 'text', isPrimary: true },
      { key: 'completed', label: 'Completed', kind: 'number', align: 'right' },
      { key: 'pending', label: 'Pending', kind: 'number', align: 'right' },
      { key: 'avgCycleDays', label: 'Avg cycle (days)', kind: 'days', align: 'right' },
    ],
  },
];

const DEFINITIONS_BY_ID = new Map<string, ReportDefinition>(
  REPORT_DEFINITIONS.map((def) => [def.id, def])
);

export const getReportDefinition = (id: string): ReportDefinition => {
  const def = DEFINITIONS_BY_ID.get(id);
  if (!def) {
    throw new Error(`Unknown report id: ${id}`);
  }
  return def;
};

export const tryGetReportDefinition = (id: string): ReportDefinition | null =>
  DEFINITIONS_BY_ID.get(id) ?? null;

export const ALL_REPORTS_HUB_ID = 'all-reports';
export const DELIVERIES_SECTION_ID = 'deliveries';

export const REPORT_SECTION_IDS: string[] = [
  ALL_REPORTS_HUB_ID,
  ...REPORT_DEFINITIONS.map((d) => d.id),
  DELIVERIES_SECTION_ID,
];

export const buildReportRouteMap = (basePath: string): Record<string, string> => {
  const map: Record<string, string> = {
    [ALL_REPORTS_HUB_ID]: `${basePath}/reports`,
    [DELIVERIES_SECTION_ID]: `${basePath}/reports/deliveries`,
  };
  for (const def of REPORT_DEFINITIONS) {
    map[def.id] = `${basePath}/reports/${def.id}`;
  }
  return map;
};

export const buildReportSectionTitles = (): Record<string, string> => {
  const titles: Record<string, string> = {
    [ALL_REPORTS_HUB_ID]: 'All reports',
    [DELIVERIES_SECTION_ID]: 'Deliveries',
  };
  for (const def of REPORT_DEFINITIONS) {
    titles[def.id] = def.title;
  }
  return titles;
};
