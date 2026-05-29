import { Panel } from '@/shared/ui/layout/Panel';
import type { InvoiceDetail } from '@/features/invoices/types';

interface InvoiceSummaryPanelProps {
  detail: InvoiceDetail;
}

const SummaryField = ({
  label,
  value,
  emptyText = '—',
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  emptyText?: string;
  multiline?: boolean;
}) => {
  const hasValue = Boolean(value && value.trim().length > 0);
  return (
    <div>
      <p className="text-xs font-medium text-dim-2">{label}</p>
      <p
        className={`mt-1 text-sm ${hasValue ? 'text-ink' : 'text-dim-2'} ${multiline ? 'whitespace-pre-line' : ''}`}
      >
        {hasValue ? value : emptyText}
      </p>
    </div>
  );
};

export const InvoiceSummaryPanel = ({ detail }: InvoiceSummaryPanelProps) => {
  return (
    <Panel className="rounded-2xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink">Summary</h3>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-dim-2">Billed to</p>
          {detail.clientName ? (
            <p className="text-sm text-ink">{detail.clientName}</p>
          ) : (
            <p className="text-sm text-dim-2">No contact</p>
          )}
          {detail.clientEmail ? (
            <p className="text-sm text-dim-2">{detail.clientEmail}</p>
          ) : null}
        </div>
        <SummaryField label="Invoice number" value={detail.invoiceNumber} />
        {detail.notes && detail.notes.trim().length > 0 ? (
          <div className="sm:col-span-2">
            <SummaryField label="Notes to client" value={detail.notes} multiline />
          </div>
        ) : null}
      </div>
    </Panel>
  );
};
