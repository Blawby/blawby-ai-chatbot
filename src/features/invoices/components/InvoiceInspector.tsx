import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { InvoiceDetailsSidebar } from '@/features/invoices/components/detail/InvoiceDetailsSidebar';
import { useInvoiceDetail } from '@/features/invoices/hooks/useInvoiceDetail';
import type { InvoiceStatus } from '@/features/invoices/types';
import {
  InfoRow,
  InspectorGroup,
  InspectorHeaderEntity,
} from '@/shared/ui/inspector/InspectorPrimitives';
import { InspectorSectionSkeleton } from '@/shared/ui/layout';

const VALID_INVOICE_STATUSES: ReadonlyArray<InvoiceStatus> = [
  'staged', 'draft', 'pending', 'sent', 'open', 'overdue', 'paid', 'void', 'cancelled',
];

const isValidInvoiceStatus = (value: unknown): value is InvoiceStatus =>
  typeof value === 'string' && (VALID_INVOICE_STATUSES as readonly string[]).includes(value);

export interface InvoiceInspectorProps {
  /** Practice (org) id — when provided alongside entityId, the inspector
   *  loads the full InvoiceDetail and renders the rich sidebar (Stripe /
   *  payments / refunds / metadata) — same source of truth as the detail
   *  page. */
  practiceId?: string;
  /** Invoice id; pairs with practiceId for the live fetch path. */
  entityId?: string;
  /** Legacy summary-only fields. Kept for debug/storybook callers that
   *  don't have a practiceId+entityId pair to hand the inspector. */
  clientName?: string | null;
  matterTitle?: string | null;
  status?: string | null;
  total?: string | null;
  amountDue?: string | null;
  dueDate?: string | null;
}

/**
 * InvoiceInspector — per-feature inspector for the invoice entity type.
 *
 * Renders inside the AppShell inspector slot (right rail) via
 * InspectorPanel. When given a practiceId + entityId, fetches the full
 * InvoiceDetail and renders the Stripe / payment-history / refund /
 * metadata sidebar that previously sat inline on the detail page.
 *
 * The legacy summary-only props remain for DebugDialogsPage and other
 * non-live callers.
 */
export const InvoiceInspector = ({
  practiceId,
  entityId,
  clientName,
  matterTitle,
  status,
  total,
  amountDue,
  dueDate,
}: InvoiceInspectorProps) => {
  const hasLiveFetch = Boolean(practiceId && entityId);
  const {
    data: detailData,
    isLoading,
  } = useInvoiceDetail(
    hasLiveFetch && practiceId ? practiceId : null,
    hasLiveFetch && entityId ? entityId : null,
  );
  const detail = detailData ?? null;

  const headerClient = detail?.clientName ?? clientName ?? undefined;
  const headerMatter = detail?.matterTitle ?? matterTitle ?? 'Invoice';
  const headerStatus = detail?.status ?? status ?? undefined;

  return (
    <div className="pb-4">
      <InspectorHeaderEntity
        chip="INVOICE"
        title={headerMatter}
        subtitle={headerClient ?? undefined}
        statusBadge={
          isValidInvoiceStatus(headerStatus)
            ? <InvoiceStatusBadge status={headerStatus} />
            : <span className="text-[11px] text-dim">—</span>
        }
      />

      {hasLiveFetch ? (
        isLoading && !detail ? (
          <div className="px-5 pt-2">
            <InspectorSectionSkeleton wideRows={[true, false, true, false, true, false]} />
          </div>
        ) : detail ? (
          <div className="px-5 pt-2">
            <InvoiceDetailsSidebar detail={detail} />
          </div>
        ) : (
          <div className="px-5 pt-2 text-[12px] text-dim-2">
            Invoice details are unavailable.
          </div>
        )
      ) : (
        <InspectorGroup label="Invoice Details">
          <InfoRow label="Contact" value={clientName ?? undefined} muted={!clientName} />
          <InfoRow label="Matter" value={matterTitle ?? undefined} muted={!matterTitle} />
          <InfoRow label="Due Date" value={dueDate ?? undefined} muted={!dueDate} />
          <InfoRow label="Total Amount" value={total ?? undefined} muted={!total} />
          <InfoRow label="Amount Due" value={amountDue ?? undefined} muted={!amountDue} />
        </InspectorGroup>
      )}
    </div>
  );
};
