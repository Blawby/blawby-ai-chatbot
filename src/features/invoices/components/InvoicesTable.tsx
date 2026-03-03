import { useTranslation } from 'react-i18next';
import type { FunctionComponent } from 'preact';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { Button } from '@/shared/ui/Button';

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
  const { t } = useTranslation();

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
        {t('invoices.error')}: {error}
      </div>
    );
  }

  if (loading) {
    return <div className="glass-panel p-4 text-sm text-input-placeholder">{t('invoices.loading')}</div>;
  }

  if (invoices.length === 0) {
    return (
      <div className="glass-panel p-4 text-sm text-input-placeholder">
        {emptyMessage ?? t('invoices.empty')}
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line-glass/30 text-xs uppercase tracking-[0.08em] text-input-placeholder">
            <tr>
              <th className="px-4 py-3">{t('invoices.columns.invoice')}</th>
              <th className="px-4 py-3">{t('invoices.columns.client')}</th>
              <th className="px-4 py-3">{t('invoices.columns.status')}</th>
              <th className="px-4 py-3">{t('invoices.columns.issueDate')}</th>
              <th className="px-4 py-3">{t('invoices.columns.dueDate')}</th>
              <th className="px-4 py-3 text-right">{t('invoices.columns.total')}</th>
              <th className="px-4 py-3 text-right">{t('invoices.columns.amountDue')}</th>
              <th className="px-4 py-3 text-center">{t('invoices.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-line-glass/20 last:border-b-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 font-medium text-input-text">{invoice.invoiceNumber}</td>
                <td className="px-4 py-3 text-input-text">{invoice.clientName ?? '—'}</td>
                <td className="px-4 py-3"><InvoiceStatusBadge status={invoice.status} /></td>
                <td className="px-4 py-3 text-input-text">{invoice.issueDate ? formatLongDate(invoice.issueDate) : '—'}</td>
                <td className="px-4 py-3 text-input-text">{invoice.dueDate ? formatLongDate(invoice.dueDate) : '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-input-text">{formatCurrency(invoice.total)}</td>
                <td className="px-4 py-3 text-right text-input-text">{formatCurrency(invoice.amountDue)}</td>
                <td className="px-4 py-3 text-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onRowClick(invoice)}
                  >
                    {t('common.view')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
