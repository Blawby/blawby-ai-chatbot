import { Panel } from '@/shared/ui/layout/Panel';
import { DetailRow } from '@/shared/ui/detail/DetailRow';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceDetail } from '@/features/invoices/types';

interface InvoiceSummaryPanelProps {
  detail: InvoiceDetail;
}

export const InvoiceSummaryPanel = ({ detail }: InvoiceSummaryPanelProps) => {
  const billedTo = [detail.clientName, detail.clientEmail].filter(Boolean).join(' • ') || null;

  return (
    <Panel className="rounded-2xl p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-input-text">Summary</h3>
      </div>
      <div className="space-y-2.5">
        <DetailRow label="Billed to" value={billedTo} emptyText="No contact" />
        <DetailRow label="Invoice number" value={detail.invoiceNumber} />
        <DetailRow label="Amount due" value={formatCurrency(detail.amountDue)} />
        <DetailRow label="Amount paid" value={formatCurrency(detail.amountPaid)} />
        <DetailRow label="Subtotal" value={formatCurrency(detail.subtotal ?? 0)} />
        {(detail.discountAmount ?? 0) > 0 ? (
          <DetailRow label="Discount" value={`-${formatCurrency(detail.discountAmount ?? 0)}`} />
        ) : null}
        {(detail.taxAmount ?? 0) > 0 ? (
          <DetailRow label="Tax" value={formatCurrency(detail.taxAmount ?? 0)} />
        ) : null}
        <DetailRow label="Total" value={formatCurrency(detail.total)} />
        <DetailRow label="Memo" value={detail.memo} emptyText="No memo" />
      </div>
    </Panel>
  );
};
