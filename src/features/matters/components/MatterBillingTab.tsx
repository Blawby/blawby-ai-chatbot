import { useErrorBoundary } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Receipt } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { InfoCard } from '@/shared/ui/cards/InfoCard';
import { DetailRow } from '@/shared/ui/detail/DetailRow';
import { SegmentedToggle } from '@/shared/ui/input/SegmentedToggle';
import { TimeEntriesPanel } from '@/features/matters/components/time-entries/TimeEntriesPanel';
import { MatterExpensesPanel } from '@/features/matters/components/expenses/MatterExpensesPanel';
import { InvoicesSection } from '@/features/matters/components/billing/InvoicesSection';
import { UnbilledSummaryCard } from '@/features/matters/components/billing/UnbilledSummaryCard';

import type {
  MatterDetail,
  MatterExpense,
  TimeEntry
} from '@/features/matters/data/matterTypes';
import type { Invoice, UnbilledSummary } from '@/features/matters/types/billing.types';
import type { TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';
import type { ExpenseFormValues } from '@/features/matters/components/expenses/ExpenseForm';
import { formatCurrency } from '@/shared/utils/currencyFormatter';

export type BillingSubTab = 'unbilled' | 'time' | 'expenses' | 'rates';

const BILLING_SEGMENTS: ReadonlyArray<{ id: BillingSubTab; label: string }> = [
  { id: 'unbilled', label: 'Unbilled' },
  { id: 'time', label: 'Time' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'rates', label: 'Rates' }
];

const BILLING_TYPE_LABEL: Record<MatterDetail['billingType'], string> = {
  hourly: 'Hourly',
  fixed: 'Fixed fee',
  contingency: 'Contingency',
  pro_bono: 'Pro bono'
};

const PAYMENT_FREQUENCY_LABEL: Record<NonNullable<MatterDetail['paymentFrequency']>, string> = {
  project: 'Project',
  milestone: 'Milestone'
};

const ErrorBanner = ({ children }: { children: ComponentChildren }) => (
  <div className="status-error rounded-2xl px-4 py-3 text-sm">{children}</div>
);

const BillingErrorBoundary = ({
  children,
  onRetry
}: {
  children: ComponentChildren;
  onRetry: () => void;
}) => {
  const [error, resetError] = useErrorBoundary((err) => {
    console.error('[MatterBillingTab] Render failed', err);
  });

  if (error) {
    return (
      <ErrorBanner>
        <div className="flex items-center justify-between gap-4">
          <span>Unable to load billing data.</span>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              resetError();
              onRetry();
            }}
          >
            Retry
          </Button>
        </div>
      </ErrorBanner>
    );
  }

  return <>{children}</>;
};

export interface MatterBillingTabProps {
  detail: MatterDetail;
  subTab: BillingSubTab;
  onSubTabChange: (next: BillingSubTab) => void;

  timeEntries: TimeEntry[];
  timeEntriesLoading: boolean;
  timeEntriesError: string | null;
  onSaveTimeEntry: (values: TimeEntryFormValues, existing?: TimeEntry | null) => void;
  onDeleteTimeEntry: (entry: TimeEntry) => void;

  expenses: MatterExpense[];
  expensesLoading: boolean;
  expensesError: string | null;
  onCreateExpense: (values: ExpenseFormValues) => Promise<void>;
  onUpdateExpense: (expense: MatterExpense, values: ExpenseFormValues) => Promise<void>;
  onDeleteExpense: (expense: MatterExpense) => Promise<void>;

  invoices: Invoice[];
  invoicesLoading: boolean;
  invoicesError: string | null;
  unbilledSummary: UnbilledSummary | null;
  onCreateInvoice: () => void;
  onCreateMilestoneInvoice: (milestoneId: string) => void;
  onEnterSettlement: () => void;
  onViewInvoice: (invoice: Invoice) => void;

  onRetry: () => void;
}

export const MatterBillingTab = ({
  detail,
  subTab,
  onSubTabChange,
  timeEntries,
  timeEntriesLoading,
  timeEntriesError,
  onSaveTimeEntry,
  onDeleteTimeEntry,
  expenses,
  expensesLoading,
  expensesError,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  invoices,
  invoicesLoading,
  invoicesError,
  unbilledSummary,
  onCreateInvoice,
  onCreateMilestoneInvoice,
  onEnterSettlement,
  onViewInvoice,
  onRetry
}: MatterBillingTabProps) => (
  <BillingErrorBoundary onRetry={onRetry}>
    <div className="space-y-5">
      <SegmentedToggle<BillingSubTab>
        value={subTab}
        options={BILLING_SEGMENTS.map((segment) => ({ value: segment.id, label: segment.label }))}
        onChange={onSubTabChange}
        ariaLabel="Billing section"
        className="w-full sm:w-auto sm:min-w-[28rem]"
      />

      {subTab === 'unbilled' ? (
        <div className="space-y-6">
          {invoicesError ? (
            <ErrorBanner>
              <div className="flex items-center justify-between gap-4">
                <span>{invoicesError}</span>
                <Button size="xs" variant="secondary" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            </ErrorBanner>
          ) : null}
          {unbilledSummary ? (
            <UnbilledSummaryCard
              summary={unbilledSummary}
              matter={detail}
              onCreateInvoice={onCreateInvoice}
              onInvoiceMilestone={onCreateMilestoneInvoice}
              onEnterSettlement={onEnterSettlement}
            />
          ) : null}
          <InvoicesSection
            invoices={invoices}
            loading={invoicesLoading}
            error={invoicesError}
            onViewInvoice={onViewInvoice}
          />
        </div>
      ) : null}

      {subTab === 'time' ? (
        <TimeEntriesPanel
          key={`time-${detail.id}`}
          entries={timeEntries}
          onSaveEntry={(values, existing) => onSaveTimeEntry(values, existing)}
          onDeleteEntry={(entry) => onDeleteTimeEntry(entry)}
          loading={timeEntriesLoading}
          error={timeEntriesError}
        />
      ) : null}

      {subTab === 'expenses' ? (
        <MatterExpensesPanel
          key={`expenses-${detail.id}`}
          matter={detail}
          expenses={expenses}
          loading={expensesLoading}
          error={expensesError}
          onCreateExpense={onCreateExpense}
          onUpdateExpense={onUpdateExpense}
          onDeleteExpense={onDeleteExpense}
        />
      ) : null}

      {subTab === 'rates' ? (
        <InfoCard icon={Receipt} title="Billing configuration" bodyGap="sm">
          <DetailRow label="Billing type" value={BILLING_TYPE_LABEL[detail.billingType]} />
          <DetailRow
            label="Attorney rate"
            value={detail.attorneyHourlyRate ? `${formatCurrency(detail.attorneyHourlyRate)}/hr` : null}
          />
          <DetailRow
            label="Admin rate"
            value={detail.adminHourlyRate ? `${formatCurrency(detail.adminHourlyRate)}/hr` : null}
          />
          <DetailRow
            label="Fixed price"
            value={detail.totalFixedPrice ? formatCurrency(detail.totalFixedPrice) : null}
          />
          <DetailRow
            label="Contingency %"
            value={detail.contingencyPercent != null ? `${detail.contingencyPercent}%` : null}
          />
          <DetailRow
            label="Payment frequency"
            value={detail.paymentFrequency ? PAYMENT_FREQUENCY_LABEL[detail.paymentFrequency] : null}
          />
        </InfoCard>
      ) : null}
    </div>
  </BillingErrorBoundary>
);
