import { useMemo } from 'preact/hooks';
import { getMajorAmountValue } from '@/shared/utils/money';
import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import type { Invoice } from '@/features/matters/types/billing.types';

type InvoicesSectionProps = {
  invoices: Invoice[];
  loading?: boolean;
  error?: string | null;
  onViewInvoice: (invoice: Invoice) => void;
  onViewCustomer?: (clientId: string) => void;
  onSendInvoice?: () => void;
  onResendInvoice?: () => void;
  onVoidInvoice?: () => void;
  onSyncInvoice?: () => void;
};

const toInvoiceSummary = (invoice: Invoice): InvoiceSummary => ({
  id: invoice.id,
  invoiceNumber: invoice.stripe_invoice_number || invoice.invoice_number || 'Draft',
  stripeInvoiceNumber: invoice.stripe_invoice_number ?? null,
  status: invoice.status,
  subtotal: getMajorAmountValue(invoice.subtotal),
  taxAmount: getMajorAmountValue(invoice.tax_amount),
  discountAmount: getMajorAmountValue(invoice.discount_amount),
  clientName: invoice.client?.name ?? null,
  clientEmail: invoice.client?.email ?? null,
  clientStatus: invoice.client?.status ?? null,
  clientId: invoice.client_id,
  matterTitle: invoice.matter?.title ?? null,
  matterId: invoice.matter_id ?? null,
  matterStatus: invoice.matter?.status ?? null,
  matterBillingType: invoice.matter?.billing_type ?? null,
  matterRetainerBalance: invoice.matter?.retainer_balance != null ? getMajorAmountValue(invoice.matter.retainer_balance) : null,
  total: getMajorAmountValue(invoice.total),
  amountDue: getMajorAmountValue(invoice.amount_due),
  amountPaid: getMajorAmountValue(invoice.amount_paid),
  invoiceType: invoice.invoice_type,
  notes: invoice.notes,
  memo: invoice.memo,
  fundDestination: invoice.fund_destination ?? null,
  paymentFromRetainer: invoice.payment_from_retainer ?? null,
  issueDate: invoice.issue_date,
  dueDate: invoice.due_date,
  paidAt: invoice.paid_at,
  connectedAccountId: invoice.connected_account_id,
  connectedAccountEmail: invoice.connectedAccount?.email ?? null,
  connectedAccountStripeAccountId: invoice.connectedAccount?.stripe_account_id ?? null,
  stripeInvoiceId: invoice.stripe_invoice_id,
  stripeChargeId: invoice.stripe_charge_id ?? null,
  stripeTransferId: invoice.stripe_transfer_id ?? null,
  stripePaymentIntentId: invoice.stripe_payment_intent_id ?? null,
  stripeHostedInvoiceUrl: invoice.stripe_hosted_invoice_url,
  createdAt: invoice.created_at,
  updatedAt: invoice.updated_at,
});

export const InvoicesSection = ({
  invoices,
  loading = false,
  error = null,
  onViewInvoice,
  onViewCustomer,
  onSendInvoice,
  onResendInvoice,
  onVoidInvoice,
  onSyncInvoice,
}: InvoicesSectionProps) => {
  const summaries = useMemo(() => invoices.map(toInvoiceSummary), [invoices]);
  const invoiceById = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice] as const)), [invoices]);

  return (
    <InvoicesTable
      invoices={summaries}
      loading={loading}
      error={error}
      emptyMessage="No invoices yet for this matter."
      onRowClick={(invoice) => {
        const sourceInvoice = invoiceById.get(invoice.id);
        if (sourceInvoice) {
          onViewInvoice(sourceInvoice);
        }
      }}
      onViewCustomer={onViewCustomer}
      onSendInvoice={onSendInvoice}
      onResendInvoice={onResendInvoice}
      onVoidInvoice={onVoidInvoice}
      onSyncInvoice={onSyncInvoice}
    />
  );
};
