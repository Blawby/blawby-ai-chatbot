import { useCallback } from 'preact/hooks';
import { Copy } from 'lucide-preact';
import { Panel } from '@/shared/ui/layout/Panel';
import { Button } from '@/shared/ui/Button';
import { Pill, type PillTone } from '@/design-system/primitives';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type {
  InvoiceDetail,
  InvoicePaymentEvent,
  InvoiceRefundEvent,
  InvoiceRefundRequestEvent,
} from '@/features/invoices/types';

interface InvoiceDetailsSidebarProps {
  detail: InvoiceDetail;
  /** When provided, renders a "Review" button on pending refund requests. */
  onReviewRequest?: (request: InvoiceRefundRequestEvent) => void;
}

const dateOrDash = (value: string | null): string => (value ? formatLongDate(value) : '—');

type CopyableFieldProps = {
  label: string;
  value: string | null;
  monospace?: boolean;
};

const CopyableField = ({ label, value, monospace }: CopyableFieldProps) => {
  const { showSuccess, showError } = useToastContext();

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(`${label} copied`, value);
    } catch (err) {
      showError(`Could not copy ${label.toLowerCase()}`, err instanceof Error ? err.message : 'Unknown error');
    }
  }, [label, value, showError, showSuccess]);

  if (!value) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-dim-2">{label}</span>
        <span className="text-dim-2">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-dim-2">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={monospace ? 'truncate font-mono text-xs text-ink' : 'truncate text-ink'}>
          {value}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          icon={Copy}
          iconClassName="h-3.5 w-3.5"
        />
      </div>
    </div>
  );
};

const paymentTone = (status: string): PillTone => {
  const normalized = status.toLowerCase();
  if (normalized === 'succeeded' || normalized === 'paid' || normalized === 'completed') return 'live';
  if (normalized === 'failed' || normalized === 'cancelled') return 'urgent';
  if (normalized === 'pending') return 'warn';
  return 'dim';
};

const refundTone = (status: string): PillTone => {
  const normalized = status.toLowerCase();
  if (normalized === 'succeeded' || normalized === 'executed') return 'live';
  if (normalized === 'failed' || normalized === 'declined' || normalized === 'cancelled') return 'urgent';
  if (normalized === 'pending' || normalized === 'requested' || normalized === 'approved') return 'warn';
  return 'dim';
};

const isPendingRequest = (status: string): boolean => {
  const normalized = status.toLowerCase();
  return normalized === 'pending' || normalized === 'requested' || normalized === 'approved';
};

const PaymentRow = ({ payment }: { payment: InvoicePaymentEvent }) => (
  <li className="flex items-start justify-between gap-3 rounded-r-md border border-line-subtle bg-paper-2/20 px-3 py-2">
    <div className="min-w-0">
      <p className="text-sm font-medium text-ink">{formatCurrency(payment.amount)}</p>
      <p className="text-xs text-dim-2">
        {payment.paidAt ? formatLongDate(payment.paidAt) : 'Date unknown'}
      </p>
      {payment.note ? <p className="mt-1 text-xs text-dim-2">{payment.note}</p> : null}
    </div>
    <Pill tone={paymentTone(payment.status)}>{payment.status}</Pill>
  </li>
);

const RefundRequestRow = ({
  request,
  onReviewRequest,
}: {
  request: InvoiceRefundRequestEvent;
  onReviewRequest?: (request: InvoiceRefundRequestEvent) => void;
}) => {
  const pending = isPendingRequest(request.status);
  const eventDate = request.updatedAt ?? request.createdAt;
  return (
    <li className="flex items-start justify-between gap-3 rounded-r-md border border-line-subtle bg-paper-2/20 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {request.amount != null ? formatCurrency(request.amount) : 'Full refund'}
          <span className="ml-2 text-xs text-dim-2">Request</span>
        </p>
        <p className="text-xs text-dim-2">{eventDate ? formatLongDate(eventDate) : 'Date unknown'}</p>
        {request.reason ? <p className="mt-1 text-xs text-dim-2">{request.reason}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Pill tone={refundTone(request.status)}>{request.status}</Pill>
        {pending && onReviewRequest ? (
          <Button size="xs" variant="secondary" onClick={() => onReviewRequest(request)}>
            Review
          </Button>
        ) : null}
      </div>
    </li>
  );
};

const RefundRow = ({ refund }: { refund: InvoiceRefundEvent }) => (
  <li className="flex items-start justify-between gap-3 rounded-r-md border border-line-subtle bg-paper-2/20 px-3 py-2">
    <div className="min-w-0">
      <p className="text-sm font-medium text-ink">{formatCurrency(refund.amount)}</p>
      <p className="text-xs text-dim-2">
        {refund.createdAt ? formatLongDate(refund.createdAt) : 'Date unknown'}
      </p>
      {refund.reason ? <p className="mt-1 text-xs text-dim-2">{refund.reason}</p> : null}
    </div>
    <Pill tone={refundTone(refund.status)}>{refund.status}</Pill>
  </li>
);

/**
 * Right-rail metadata for an invoice detail view. Lives in the AppShell
 * inspector slot (rendered via InvoiceInspector → InspectorPanel).
 *
 * Surfaces: Recipient · Totals · Stripe · Payments · Refunds · Metadata · Audit.
 */
export const InvoiceDetailsSidebar = ({ detail, onReviewRequest }: InvoiceDetailsSidebarProps) => {
  const hasStripeData = Boolean(
    detail.stripeInvoiceId
      || detail.stripeChargeId
      || detail.stripePaymentIntentId
      || detail.stripeHostedInvoiceUrl
  );

  const showDiscount = (detail.discountAmount ?? 0) > 0;
  const showTax = (detail.taxAmount ?? 0) > 0;
  const showPaymentBreakdown = detail.amountPaid > 0;

  const hasPayments = detail.payments.length > 0;
  const hasRefunds = detail.refunds.length > 0 || detail.refundRequests.length > 0;

  return (
    <aside className="flex flex-col gap-4">
      <Panel className="rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Recipient</h3>
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-dim-2">Billed to</p>
            <p className="mt-1 text-ink">{detail.clientName?.trim() || <span className="text-dim-2">No contact</span>}</p>
            {detail.clientEmail ? (
              <p className="text-xs text-dim-2">{detail.clientEmail}</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-dim-2">Issued</span>
            <span className="text-ink">{dateOrDash(detail.issueDate)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-dim-2">Due</span>
            <span className="text-ink">{dateOrDash(detail.dueDate)}</span>
          </div>
          {detail.paidAt ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-dim-2">Paid</span>
              <span className="text-ink">{formatLongDate(detail.paidAt)}</span>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel className="rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Totals</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-dim-2">Subtotal</span>
            <span className="text-ink tabular-nums">{formatCurrency(detail.subtotal ?? 0)}</span>
          </div>
          {showDiscount ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-dim-2">Discount</span>
              <span className="text-ink tabular-nums">-{formatCurrency(detail.discountAmount ?? 0)}</span>
            </div>
          ) : null}
          {showTax ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-dim-2">Tax</span>
              <span className="text-ink tabular-nums">{formatCurrency(detail.taxAmount ?? 0)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-line-subtle pt-2">
            <span className="font-semibold text-ink">Total</span>
            <span className="font-semibold text-ink tabular-nums">{formatCurrency(detail.total)}</span>
          </div>
          {showPaymentBreakdown ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-dim-2">Paid</span>
                <span className="text-ink tabular-nums">-{formatCurrency(detail.amountPaid)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-dim-2">Remaining</span>
                <span className="text-ink tabular-nums">{formatCurrency(detail.amountDue)}</span>
              </div>
            </>
          ) : null}
        </div>
      </Panel>

      {hasStripeData ? (
        <Panel className="rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Stripe</h3>
          <div className="space-y-2">
            {detail.stripeInvoiceId ? (
              <CopyableField label="Invoice ID" value={detail.stripeInvoiceId} monospace />
            ) : null}
            {detail.stripeInvoiceNumber ? (
              <CopyableField label="Invoice number" value={detail.stripeInvoiceNumber} monospace />
            ) : null}
            {detail.stripeChargeId ? (
              <CopyableField label="Charge ID" value={detail.stripeChargeId} monospace />
            ) : null}
            {detail.stripePaymentIntentId ? (
              <CopyableField label="Payment intent" value={detail.stripePaymentIntentId} monospace />
            ) : null}
            {detail.stripeHostedInvoiceUrl ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-dim-2">Hosted URL</span>
                <a
                  href={detail.stripeHostedInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-accent underline decoration-current/40 underline-offset-2"
                >
                  Open
                </a>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {hasPayments ? (
        <Panel className="rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Payments</h3>
            <span className="text-xs text-dim-2">{detail.payments.length}</span>
          </div>
          <ul className="space-y-2">
            {detail.payments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </ul>
        </Panel>
      ) : null}

      {hasRefunds ? (
        <Panel className="rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Refunds</h3>
          <ul className="space-y-2">
            {detail.refundRequests.map((request) => (
              <RefundRequestRow
                key={`request-${request.id}`}
                request={request}
                onReviewRequest={onReviewRequest}
              />
            ))}
            {detail.refunds.map((refund) => (
              <RefundRow key={`refund-${refund.id}`} refund={refund} />
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Metadata</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-dim-2">Memo</p>
            <p className="mt-1 whitespace-pre-line text-ink">
              {detail.memo?.trim() || <span className="text-dim-2">No memo</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-dim-2">Notes to client</p>
            <p className="mt-1 whitespace-pre-line text-ink">
              {detail.notes?.trim() || <span className="text-dim-2">No notes</span>}
            </p>
          </div>
        </div>
      </Panel>

      <Panel className="rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Audit</h3>
        <div className="space-y-2">
          <CopyableField label="Invoice ID" value={detail.id} monospace />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-dim-2">Created</span>
            <span className="text-ink">{dateOrDash(detail.createdAt)}</span>
          </div>
          <CopyableField label="Connected account" value={detail.connectedAccountId ?? null} monospace />
        </div>
      </Panel>
    </aside>
  );
};
