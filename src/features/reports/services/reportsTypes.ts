/**
 * Wire types for report responses. Money fields are suffixed `*Cents`
 * for invoice-derived amounts (integers) and `*Hours` for time totals.
 */

export interface ReportEnvelope<TRow, TMeta extends Record<string, unknown> = Record<string, unknown>> {
  items: TRow[];
  total: number;
  generatedAt: string;
  filters: Record<string, string | undefined>;
  meta?: TMeta;
}

export interface RevenueRow {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  invoiceCount: number;
  paidAmountCents: number;
  outstandingAmountCents: number;
}

export interface RevenueMeta {
  totalPaidCents: number;
  totalOutstandingCents: number;
  totalInvoiceCount: number;
}

export interface AgingRow {
  bucketLabel: string;
  bucketMinDays: number;
  bucketMaxDays: number | null;
  invoiceCount: number;
  totalAmountCents: number;
}

export interface AgingMeta {
  totalOutstandingCents: number;
  totalInvoiceCount: number;
}

export interface ProfitabilityRow {
  matterId: string;
  matterTitle: string;
  revenueCents: number;
  estimatedCostCents: number;
  marginCents: number;
  billableHours: number;
}

export interface ProfitabilityMeta {
  totalRevenueCents: number;
  totalCostCents: number;
  totalMarginCents: number;
  truncated?: boolean;
}

export interface UtilizationRow {
  userId: string;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  utilizationPercent: number;
}

export interface UtilizationMeta {
  totalBillableHours: number;
  totalNonBillableHours: number;
  averageUtilizationPercent: number;
  truncated?: boolean;
}

export interface TrustLedgerRow {
  id: string;
  occurredAt: string;
  clientName: string | null;
  description: string | null;
  amountCents: number;
  balanceCents: number;
}

export interface WipRow {
  matterId: string;
  matterTitle: string;
  unbilledHours: number;
  unbilledAmountCents: number;
}

export interface OriginatingAttorneyRow {
  attorneyId: string;
  attorneyName: string;
  matterCount: number;
  revenueCents: number;
}

export interface MattersByAttorneyRow {
  attorneyId: string;
  attorneyName: string;
  matterCount: number;
  openCount: number;
  closedCount: number;
}

export interface TaskProductivityRow {
  assigneeId: string;
  assigneeName: string;
  completed: number;
  pending: number;
  avgCycleDays: number;
}

export type ReportRow =
  | RevenueRow
  | AgingRow
  | ProfitabilityRow
  | UtilizationRow
  | TrustLedgerRow
  | WipRow
  | OriginatingAttorneyRow
  | MattersByAttorneyRow
  | TaskProductivityRow;

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';

export interface ReportSchedule {
  id: string;
  practiceId: string;
  reportType: string;
  frequency: ReportFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourUtc: number;
  recipients: string[];
  filters: Record<string, string>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nextDeliveryAt?: string;
}

export type ReportDeliveryStatus = 'pending' | 'completed' | 'failed';

export interface ReportDelivery {
  id: string;
  practiceId: string;
  reportType: string;
  filters: Record<string, string>;
  recipients: string[];
  status: ReportDeliveryStatus;
  storageKey?: string;
  byteSize?: number;
  errorMessage?: string;
  createdBy: string;
  createdAt: string;
  scheduledFor?: string;
  completedAt?: string;
}
