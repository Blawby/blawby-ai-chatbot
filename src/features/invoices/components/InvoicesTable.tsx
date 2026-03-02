import type { FunctionComponent } from 'preact';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';

interface InvoicesTableProps {
  invoices: InvoiceSummary[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
  onRowClick: (invoice: InvoiceSummary) => void;
}

export const InvoicesTable: FunctionComponent<InvoicesTableProps> = ({
  invoices,
  loading,
  error,
  emptyMessage,
  onRowClick,
}) => {
  if (error) {
    return <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>;
  }

  if (loading) {
    return <div className="glass-panel p-4 text-sm text-input-placeholder">Loading invoices...</div>;
  }

  if (invoices.length === 0) {
    return (
      <div className="glass-panel p-4 text-sm text-input-placeholder">
        {emptyMessage ?? 'No invoices match these filters.'}
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line-glass/30 text-xs uppercase tracking-[0.08em] text-input-placeholder">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Issue</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Amount Due</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="cursor-pointer border-b border-line-glass/20 last:border-b-0 hover:bg-white/[0.03]"
                onClick={() => onRowClick(invoice)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(invoice);
                  }
                }}
              >
                <td className="px-4 py-3 font-medium text-input-text">{invoice.invoiceNumber}</td>
                <td className="px-4 py-3 text-input-text">{invoice.clientName ?? '—'}</td>
                <td className="px-4 py-3"><InvoiceStatusBadge status={invoice.status} /></td>
                <td className="px-4 py-3 text-input-text">{invoice.issueDate ? formatLongDate(invoice.issueDate) : '—'}</td>
                <td className="px-4 py-3 text-input-text">{invoice.dueDate ? formatLongDate(invoice.dueDate) : '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-input-text">{formatCurrency(invoice.total)}</td>
                <td className="px-4 py-3 text-right text-input-text">{formatCurrency(invoice.amountDue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
