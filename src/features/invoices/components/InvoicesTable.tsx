import type { ComponentChildren, FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import {
  DEFAULT_INVOICE_COLUMNS,
  OPTIONAL_INVOICE_COLUMNS,
  type InvoiceColumnKey,
} from '@/features/invoices/config/invoiceCollection';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';

interface InvoicesTableProps {
  invoices: InvoiceSummary[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
  onRowClick: (invoice: InvoiceSummary) => void;
  onViewCustomer?: (clientId: string) => void;
  toolbar?: ComponentChildren;
  loadingMore?: boolean;
  visibleOptionalColumns?: InvoiceColumnKey[];
  footer?: ComponentChildren;
}

const textValue = (value: string | null | undefined) => value && value.trim().length > 0 ? value : '—';
const dateValue = (value: string | null | undefined) => value ? formatLongDate(value) : '—';
const optionalColumnLabels = new Map(OPTIONAL_INVOICE_COLUMNS.map((column) => [column.key, column.label] as const));

const renderUrlCell = (value: string | null | undefined) => {
  if (!value) return '—';
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="truncate text-accent-foreground underline decoration-current/40 underline-offset-2"
      onClick={(event) => event.stopPropagation()}
    >
      Open
    </a>
  );
};

export const InvoicesTable: FunctionComponent<InvoicesTableProps> = ({
  invoices,
  loading,
  error,
  emptyMessage,
  onRowClick,
  onViewCustomer,
  toolbar,
  loadingMore = false,
  visibleOptionalColumns = [],
  footer,
}) => {
  const { showError, showSuccess } = useToastContext();

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(`${label} copied`, value);
    } catch (copyError) {
      showError(`Unable to copy ${label.toLowerCase()}`, copyError instanceof Error ? copyError.message : 'Unknown error');
    }
  };

  const columns = useMemo<DataTableColumn[]>(() => {
    const ordered = [...DEFAULT_INVOICE_COLUMNS, ...visibleOptionalColumns];

    return ordered.map((key): DataTableColumn => {
      switch (key) {
        case 'total':
          return { id: key, label: 'Total' };
        case 'status':
          return { id: key, label: 'Status' };
        case 'invoiceNumber':
          return { id: key, label: 'Invoice number', isPrimary: true, isAction: true };
        case 'clientName':
          return { id: key, label: 'Customer name' };
        case 'clientEmail':
          return { id: key, label: 'Customer email', hideAt: 'md', mobileClassName: 'text-input-placeholder' };
        case 'dueDate':
          return { id: key, label: 'Due', hideAt: 'md', mobileClassName: 'text-input-placeholder' };
        case 'createdAt':
          return { id: key, label: 'Created', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'paidAt':
          return { id: key, label: 'Paid at', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'subtotal':
          return { id: key, label: 'Subtotal', align: 'right', hideAt: 'lg', mobileClassName: 'text-input-text' };
        case 'taxAmount':
          return { id: key, label: 'Tax amount', align: 'right', hideAt: 'lg', mobileClassName: 'text-input-text' };
        case 'discountAmount':
          return { id: key, label: 'Discount amount', align: 'right', hideAt: 'lg', mobileClassName: 'text-input-text' };
        case 'amountPaid':
          return { id: key, label: 'Amount paid', align: 'right', hideAt: 'lg', mobileClassName: 'text-input-text' };
        case 'amountDue':
          return { id: key, label: 'Amount due', align: 'right', hideAt: 'lg', mobileClassName: 'text-input-text' };
        case 'issueDate':
          return { id: key, label: 'Issue date', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'invoiceType':
          return { id: key, label: 'Invoice type', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'notes':
          return { id: key, label: 'Notes', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'memo':
          return { id: key, label: 'Memo', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'fundDestination':
          return { id: key, label: 'Fund destination', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'updatedAt':
          return { id: key, label: 'Updated at', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'clientId':
          return { id: key, label: 'Client ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'matterId':
          return { id: key, label: 'Matter ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'connectedAccountId':
          return { id: key, label: 'Connected account ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'matterTitle':
          return { id: key, label: 'Matter title', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'matterBillingType':
          return { id: key, label: 'Billing type', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'clientStatus':
          return { id: key, label: 'Client status', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'stripeInvoiceNumber':
          return { id: key, label: 'Stripe invoice number', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'stripeInvoiceId':
          return { id: key, label: 'Stripe invoice ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'stripeChargeId':
          return { id: key, label: 'Stripe charge ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'stripeTransferId':
          return { id: key, label: 'Stripe transfer ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'stripePaymentIntentId':
          return { id: key, label: 'Stripe payment intent ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'stripeHostedInvoiceUrl':
          return { id: key, label: 'Hosted invoice URL', hideAt: 'lg', mobileClassName: 'text-input-placeholder', disableCellWrap: true };
        case 'connectedAccountEmail':
          return { id: key, label: 'Connected account email', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        case 'connectedAccountStripeAccountId':
          return { id: key, label: 'Stripe account ID', hideAt: 'lg', mobileClassName: 'text-input-placeholder' };
        default:
          return { id: key, label: key };
      }
    }).concat([{
      id: 'actions',
      label: '',
      isAction: true,
      align: 'right',
      headerClassName: 'w-10',
      cellClassName: 'w-10 py-2.5 pl-2 pr-3',
    }]);
  }, [visibleOptionalColumns]);

  const renderOptionalMobileValue = (invoice: InvoiceSummary, key: InvoiceColumnKey) => {
    switch (key) {
      case 'paidAt':
        return dateValue(invoice.paidAt);
      case 'subtotal':
        return formatCurrency(invoice.subtotal ?? 0);
      case 'taxAmount':
        return formatCurrency(invoice.taxAmount ?? 0);
      case 'discountAmount':
        return formatCurrency(invoice.discountAmount ?? 0);
      case 'amountPaid':
        return formatCurrency(invoice.amountPaid);
      case 'amountDue':
        return formatCurrency(invoice.amountDue);
      case 'issueDate':
        return dateValue(invoice.issueDate);
      case 'invoiceType':
        return textValue(invoice.invoiceType);
      case 'notes':
        return textValue(invoice.notes);
      case 'memo':
        return textValue(invoice.memo);
      case 'fundDestination':
        return textValue(invoice.fundDestination);
      case 'updatedAt':
        return dateValue(invoice.updatedAt);
      case 'clientId':
        return textValue(invoice.clientId);
      case 'matterId':
        return textValue(invoice.matterId);
      case 'connectedAccountId':
        return textValue(invoice.connectedAccountId);
      case 'matterTitle':
        return textValue(invoice.matterTitle);
      case 'matterBillingType':
        return textValue(invoice.matterBillingType);
      case 'clientStatus':
        return textValue(invoice.clientStatus);
      case 'stripeInvoiceNumber':
        return textValue(invoice.stripeInvoiceNumber);
      case 'stripeInvoiceId':
        return textValue(invoice.stripeInvoiceId);
      case 'stripeChargeId':
        return textValue(invoice.stripeChargeId);
      case 'stripeTransferId':
        return textValue(invoice.stripeTransferId);
      case 'stripePaymentIntentId':
        return textValue(invoice.stripePaymentIntentId);
      case 'stripeHostedInvoiceUrl':
        return invoice.stripeHostedInvoiceUrl ? 'Open hosted invoice' : '—';
      case 'connectedAccountEmail':
        return textValue(invoice.connectedAccountEmail);
      case 'connectedAccountStripeAccountId':
        return textValue(invoice.connectedAccountStripeAccountId);
      default:
        return null;
    }
  };

  const rows: DataTableRow[] = invoices.map((invoice) => {
    const clientId = invoice.clientId;
    const hostedInvoiceUrl = invoice.stripeHostedInvoiceUrl;

    return {
      id: invoice.id,
      onClick: () => onRowClick(invoice),
      cells: {
      total: (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-input-text">{formatCurrency(invoice.total)}</span>
        </div>
      ),
      status: <InvoiceStatusBadge status={invoice.status} />,
      invoiceNumber: (
        <button
          type="button"
          className="truncate text-left text-sm font-semibold text-input-text hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            onRowClick(invoice);
          }}
        >
          {textValue(invoice.invoiceNumber || null)}
        </button>
      ),
      clientName: textValue(invoice.clientName),
      clientEmail: textValue(invoice.clientEmail),
      dueDate: dateValue(invoice.dueDate),
      createdAt: dateValue(invoice.createdAt),
      paidAt: dateValue(invoice.paidAt),
      subtotal: <span className="text-input-text">{formatCurrency(invoice.subtotal ?? 0)}</span>,
      taxAmount: <span className="text-input-text">{formatCurrency(invoice.taxAmount ?? 0)}</span>,
      discountAmount: <span className="text-input-text">{formatCurrency(invoice.discountAmount ?? 0)}</span>,
      amountPaid: <span className="text-input-text">{formatCurrency(invoice.amountPaid)}</span>,
      amountDue: <span className="text-input-text">{formatCurrency(invoice.amountDue)}</span>,
      issueDate: dateValue(invoice.issueDate),
      invoiceType: textValue(invoice.invoiceType),
      notes: textValue(invoice.notes),
      memo: textValue(invoice.memo),
      fundDestination: textValue(invoice.fundDestination),
      updatedAt: dateValue(invoice.updatedAt),
      clientId: textValue(invoice.clientId),
      matterId: textValue(invoice.matterId),
      connectedAccountId: textValue(invoice.connectedAccountId),
      matterTitle: textValue(invoice.matterTitle),
      matterBillingType: textValue(invoice.matterBillingType),
      clientStatus: textValue(invoice.clientStatus),
      stripeInvoiceNumber: textValue(invoice.stripeInvoiceNumber),
      stripeInvoiceId: textValue(invoice.stripeInvoiceId),
      stripeChargeId: textValue(invoice.stripeChargeId),
      stripeTransferId: textValue(invoice.stripeTransferId),
      stripePaymentIntentId: textValue(invoice.stripePaymentIntentId),
      stripeHostedInvoiceUrl: renderUrlCell(invoice.stripeHostedInvoiceUrl),
      connectedAccountEmail: textValue(invoice.connectedAccountEmail),
      connectedAccountStripeAccountId: textValue(invoice.connectedAccountStripeAccountId),
        actions: (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1 text-input-placeholder transition-colors hover:bg-white/[0.06] hover:text-input-text"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Invoice actions"
                >
                  <EllipsisHorizontalIcon className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {clientId && onViewCustomer ? (
                  <DropdownMenuItem onSelect={() => onViewCustomer(clientId)}>
                    View customer
                  </DropdownMenuItem>
                ) : null}
                {hostedInvoiceUrl ? (
                  <DropdownMenuItem onSelect={() => window.open(hostedInvoiceUrl, '_blank', 'noopener,noreferrer')}>
                    Open hosted invoice
                  </DropdownMenuItem>
                ) : null}
                {invoice.id ? (
                  <DropdownMenuItem onSelect={() => void copyText('Invoice ID', invoice.id)}>
                    Copy invoice ID
                  </DropdownMenuItem>
                ) : null}
                {invoice.invoiceNumber ? (
                  <DropdownMenuItem onSelect={() => void copyText('Invoice number', invoice.invoiceNumber)}>
                    Copy invoice number
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    };
  });

  return (
    <div className="grid gap-3">
      <DataTable
        columns={columns}
        rows={rows}
        caption="Invoices"
        toolbar={toolbar}
        emptyState={emptyMessage ?? 'No invoices found'}
        errorState={error ? (
          <div className="glass-panel rounded-xl p-4 text-sm text-red-300">
            Failed to load invoices: {error}
          </div>
        ) : undefined}
        loading={loading}
        loadingLabel="Loading invoices"
        className="glass-panel rounded-xl overflow-hidden"
        tableClassName="text-left text-sm"
        rowClassName="border-b border-line-glass/20 last:border-b-0"
        bodyClassName="bg-transparent"
        stickyHeader
        density="compact"
        renderMobileRow={(row) => {
          const invoice = invoices.find((item) => item.id === row.id);
          if (!invoice) return null;

          const clientId = invoice.clientId;
          const hostedInvoiceUrl = invoice.stripeHostedInvoiceUrl;

          return (
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onRowClick(invoice)}
                >
                  <p className="truncate text-sm font-semibold text-input-text">{textValue(invoice.invoiceNumber || null)}</p>
                  <p className="mt-2 truncate text-sm text-input-text">{textValue(invoice.clientName)}</p>
                  <p className="mt-1 truncate text-xs text-input-placeholder">{textValue(invoice.clientEmail)}</p>
                  <p className="mt-2 text-xs text-input-placeholder">Due {dateValue(invoice.dueDate)}</p>
                  <p className="mt-1 text-xs text-input-placeholder">Created {dateValue(invoice.createdAt)}</p>
                  {visibleOptionalColumns.length > 0 ? (
                    <dl className="mt-3 grid gap-2">
                      {visibleOptionalColumns.map((key) => {
                        const value = renderOptionalMobileValue(invoice, key);
                        if (value == null) return null;
                        return (
                          <div key={`${invoice.id}-${key}`} className="grid gap-1">
                            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-input-placeholder">
                              {optionalColumnLabels.get(key) ?? key}
                            </dt>
                            <dd className="truncate text-xs text-input-text">{value}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : null}
                </button>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-1 text-input-placeholder transition-colors hover:bg-white/[0.06] hover:text-input-text"
                        aria-label="Invoice actions"
                      >
                        <EllipsisHorizontalIcon className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
                      {clientId && onViewCustomer ? (
                        <DropdownMenuItem onSelect={() => onViewCustomer(clientId)}>
                          View customer
                        </DropdownMenuItem>
                      ) : null}
                      {hostedInvoiceUrl ? (
                        <DropdownMenuItem onSelect={() => window.open(hostedInvoiceUrl, '_blank', 'noopener,noreferrer')}>
                          Open hosted invoice
                        </DropdownMenuItem>
                      ) : null}
                      {invoice.id ? (
                        <DropdownMenuItem onSelect={() => void copyText('Invoice ID', invoice.id)}>
                          Copy invoice ID
                        </DropdownMenuItem>
                      ) : null}
                      {invoice.invoiceNumber ? (
                        <DropdownMenuItem onSelect={() => void copyText('Invoice number', invoice.invoiceNumber)}>
                          Copy invoice number
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <InvoiceStatusBadge status={invoice.status} />
                  <p className="text-sm font-semibold text-input-text">{formatCurrency(invoice.total)}</p>
                </div>
              </div>
            </div>
          );
        }}
      />
      {loadingMore ? (
        <div className="flex justify-center px-4 py-3">
          <LoadingSpinner size="sm" ariaLabel="Loading more invoices" />
        </div>
      ) : null}
      {footer ? (
        <div className="border-t border-line-glass/30 px-4 py-3 text-sm text-input-placeholder">
          <div>{footer}</div>
        </div>
      ) : null}
    </div>
  );
};
