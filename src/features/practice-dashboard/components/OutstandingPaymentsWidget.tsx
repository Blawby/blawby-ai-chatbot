import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/layout/Panel';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { OutstandingPaymentsSummary } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

type OutstandingPaymentsWidgetProps = {
  summary: OutstandingPaymentsSummary | null;
  loading?: boolean;
  error?: string | null;
  onViewInvoices?: () => void;
};

export const OutstandingPaymentsWidget = ({
  summary,
  loading = false,
  error = null,
  onViewInvoices
}: OutstandingPaymentsWidgetProps) => (
  <Panel className="flex h-full flex-col">
    <header className="border-b border-line-subtle px-5 py-4">
      <p className="text-sm font-semibold text-ink">Outstanding Payments</p>
      <p className="text-xs text-dim-2">Invoices awaiting payment</p>
    </header>
    <div className="flex-1 px-5 py-4">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      ) : error ? (
        <div className="rounded-r-md border border-card-border bg-card px-3 py-2 text-sm text-ink">
          {error}
        </div>
      ) : summary ? (
        <div className="space-y-4 text-sm text-ink">
          <div>
            <p className="text-xs uppercase tracking-wide text-dim-2">Awaiting payment</p>
            <p className="mt-1 text-2xl font-semibold">
              {summary.awaitingCount} invoice{summary.awaitingCount === 1 ? '' : 's'}
            </p>
            <p className="text-dim-2">Total {formatCurrency(summary.awaitingTotal)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-dim-2">Overdue</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {summary.overdueCount} invoice{summary.overdueCount === 1 ? '' : 's'}
            </p>
            <p className="text-dim-2">Total {formatCurrency(summary.overdueTotal)}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-dim-2">No unpaid invoices.</p>
      )}
    </div>
    <footer className="border-t border-line-subtle px-5 py-4">
      <Button size="sm" className="w-full" onClick={() => onViewInvoices?.()}>
        View billing
      </Button>
    </footer>
  </Panel>
);
