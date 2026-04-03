import { useTranslation } from 'react-i18next';
import type { ComponentChildren, FunctionComponent } from 'preact';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { Button } from '@/shared/ui/Button';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table';
import { cn } from '@/shared/utils/cn';

interface InvoicesTableProps {
  invoices: InvoiceSummary[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
  onRowClick: (invoice: InvoiceSummary) => void;
  toolbar?: ComponentChildren;
  loadingMore?: boolean;
}

export const InvoicesTable: FunctionComponent<InvoicesTableProps> = ({
  invoices,
  loading,
  error,
  emptyMessage,
  onRowClick,
  toolbar,
  loadingMore = false,
}) => {
  const { t } = useTranslation();

  if (error) {
    return (
      <div className="grid gap-3">
        {toolbar ? <div>{toolbar}</div> : null}
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
          {t('invoices.error')}: {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-3">
        {toolbar ? <div>{toolbar}</div> : null}
        <div className="glass-panel p-4 text-sm text-input-placeholder">{t('invoices.loading')}</div>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="grid gap-3">
        {toolbar ? <div>{toolbar}</div> : null}
        <div className="glass-panel p-4 text-sm text-input-placeholder">
          {emptyMessage ?? t('invoices.empty')}
        </div>
      </div>
    );
  }

  const columns: DataTableColumn[] = [
    {
      id: 'invoice',
      label: t('invoices.columns.invoice'),
      isPrimary: true,
    },
    {
      id: 'client',
      label: t('invoices.columns.client'),
      hideAt: 'sm',
      mobileClassName: 'text-input-placeholder',
    },
    {
      id: 'status',
      label: t('invoices.columns.status'),
    },
    {
      id: 'issueDate',
      label: t('invoices.columns.issueDate'),
      hideAt: 'lg',
      mobileClassName: 'text-input-placeholder',
    },
    {
      id: 'dueDate',
      label: t('invoices.columns.dueDate'),
      hideAt: 'md',
      mobileClassName: 'text-input-placeholder',
    },
    {
      id: 'total',
      label: t('invoices.columns.total'),
      align: 'right',
      hideAt: 'md',
      mobileClassName: 'text-input-text',
    },
    {
      id: 'amountDue',
      label: t('invoices.columns.amountDue'),
      align: 'right',
      hideAt: 'lg',
      mobileClassName: 'text-input-text',
    },
    {
      id: 'actions',
      label: t('invoices.columns.actions'),
      align: 'right',
      isAction: true,
      cellClassName: 'py-3 pl-3 pr-4 sm:pr-0',
    },
  ];

  const rows: DataTableRow[] = invoices.map((invoice) => ({
    id: invoice.id,
    onClick: () => onRowClick(invoice),
    cells: {
      invoice: (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-input-text">{invoice.invoiceNumber}</div>
          {invoice.matterTitle ? (
            <div className="mt-1 truncate text-xs text-input-placeholder">{invoice.matterTitle}</div>
          ) : null}
        </div>
      ),
      client: invoice.clientName ?? '—',
      status: <InvoiceStatusBadge status={invoice.status} />,
      issueDate: invoice.issueDate ? formatLongDate(invoice.issueDate) : '—',
      dueDate: invoice.dueDate ? formatLongDate(invoice.dueDate) : '—',
      total: <span className="font-semibold text-input-text">{formatCurrency(invoice.total)}</span>,
      amountDue: <span className="text-input-text">{formatCurrency(invoice.amountDue)}</span>,
      actions: (
        <Button
          variant="secondary"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onRowClick(invoice);
          }}
        >
          {t('common.view')}
        </Button>
      ),
    },
  }));

  return (
    <div className="grid gap-3">
      <DataTable
        columns={columns}
        rows={rows}
        caption={t('invoices.title', { defaultValue: 'Invoices' })}
        toolbar={toolbar}
        emptyState={emptyMessage ?? t('invoices.empty')}
        className="glass-panel overflow-hidden p-4 sm:p-5"
        tableClassName="text-left text-sm"
        rowClassName="border-b border-line-glass/20 last:border-b-0"
        bodyClassName="bg-transparent"
        stickyHeader
      />
      {loadingMore ? (
        <div className={cn('px-1 text-sm text-input-placeholder')}>
          Loading more invoices...
        </div>
      ) : null}
    </div>
  );
};
