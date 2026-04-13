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
  <header className="border-b border-line-glass/30 px-5 py-4">
   <p className="text-sm font-semibold text-input-text">Outstanding Payments</p>
   <p className="text-xs text-input-placeholder">Invoices awaiting payment</p>
  </header>
  <div className="flex-1 px-5 py-4">
   {loading ? (
    <div className="flex items-center justify-center py-8">
     <LoadingSpinner size="md" />
    </div>
   ) : error ? (
    <div className="rounded-lg border border-line-glass/40 bg-surface-glass px-3 py-2 text-sm text-input-text">
     {error}
    </div>
   ) : summary ? (
    <div className="space-y-4 text-sm text-input-text">
     <div>
      <p className="text-xs uppercase tracking-wide text-input-placeholder">Awaiting payment</p>
      <p className="mt-1 text-2xl font-semibold">
       {summary.awaitingCount} invoice{summary.awaitingCount === 1 ? '' : 's'}
      </p>
      <p className="text-input-placeholder">Total {formatCurrency(summary.awaitingTotal)}</p>
     </div>
     <div>
      <p className="text-xs uppercase tracking-wide text-input-placeholder">Overdue</p>
      <p className="mt-1 text-2xl font-semibold text-input-text">
       {summary.overdueCount} invoice{summary.overdueCount === 1 ? '' : 's'}
      </p>
      <p className="text-input-placeholder">Total {formatCurrency(summary.overdueTotal)}</p>
     </div>
    </div>
   ) : (
    <p className="text-sm text-input-placeholder">No unpaid invoices.</p>
   )}
  </div>
  <footer className="border-t border-line-glass/30 px-5 py-4">
   <Button size="sm" className="w-full" onClick={() => onViewInvoices?.()}>
    View billing
   </Button>
  </footer>
 </Panel>
);
