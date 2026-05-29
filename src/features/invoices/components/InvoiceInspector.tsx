import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import type { InvoiceStatus } from '@/features/invoices/types';
import {
  InfoRow,
  InspectorGroup,
  InspectorHeaderEntity,
} from '@/shared/ui/inspector/InspectorPrimitives';

const VALID_INVOICE_STATUSES: ReadonlyArray<InvoiceStatus> = [
  'draft', 'pending', 'sent', 'open', 'overdue', 'paid', 'void', 'cancelled',
];

const isValidInvoiceStatus = (value: unknown): value is InvoiceStatus =>
  typeof value === 'string' && (VALID_INVOICE_STATUSES as readonly string[]).includes(value);

export interface InvoiceInspectorProps {
  clientName?: string | null;
  matterTitle?: string | null;
  status?: string | null;
  total?: string | null;
  amountDue?: string | null;
  dueDate?: string | null;
}

/**
 * InvoiceInspector — per-feature inspector for the invoice entity type.
 * Extracted from the legacy InspectorPanel as part of the per-feature split
 * (Commit 5c, locked answer #1). Pure data-display surface; no editable
 * fields yet.
 */
export const InvoiceInspector = ({
  clientName,
  matterTitle,
  status,
  total,
  amountDue,
  dueDate,
}: InvoiceInspectorProps) => (
  <div className="pb-4">
    <InspectorHeaderEntity
      chip="INVOICE"
      title={matterTitle ?? 'Invoice'}
      subtitle={clientName ?? undefined}
      statusBadge={
        isValidInvoiceStatus(status)
          ? <InvoiceStatusBadge status={status} />
          : <span className="text-[11px] text-dim">—</span>
      }
    />
    <InspectorGroup label="Invoice Details">
      <InfoRow label="Contact" value={clientName ?? undefined} muted={!clientName} />
      <InfoRow label="Matter" value={matterTitle ?? undefined} muted={!matterTitle} />
      <InfoRow label="Due Date" value={dueDate ?? undefined} muted={!dueDate} />
      <InfoRow label="Total Amount" value={total ?? undefined} muted={!total} />
      <InfoRow label="Amount Due" value={amountDue ?? undefined} muted={!amountDue} />
    </InspectorGroup>
  </div>
);
