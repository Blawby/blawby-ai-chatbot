import { Panel } from '@/shared/ui/layout/Panel';
import { Button } from '@/shared/ui/Button';
import { Pill, type PillTone } from '@/design-system/primitives';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoiceRefundEvent, InvoiceRefundRequestEvent } from '@/features/invoices/types';

interface InvoiceRefundsSectionProps {
  refunds: InvoiceRefundEvent[];
  refundRequests: InvoiceRefundRequestEvent[];
  onReviewRequest?: (request: InvoiceRefundRequestEvent) => void;
}

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

export const InvoiceRefundsSection = ({
  refunds,
  refundRequests,
  onReviewRequest,
}: InvoiceRefundsSectionProps) => {
  if (refunds.length === 0 && refundRequests.length === 0) return null;

  return (
    <Panel className="rounded-2xl p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-input-text">Refunds</h3>
      </div>
      <div className="space-y-3">
        {refundRequests.map((request) => {
          const pending = isPendingRequest(request.status);
          const eventDate = request.updatedAt ?? request.createdAt;
          return (
            <div
              key={`request-${request.id}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-line-subtle bg-surface-utility/20 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-input-text">
                  {request.amount != null ? formatCurrency(request.amount) : 'Full refund'}
                  <span className="ml-2 text-xs text-input-placeholder">Request</span>
                </p>
                <p className="text-xs text-input-placeholder">
                  {eventDate ? formatLongDate(eventDate) : 'Date unknown'}
                </p>
                {request.reason ? (
                  <p className="mt-1 text-xs text-input-placeholder">{request.reason}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Pill tone={refundTone(request.status)}>{request.status}</Pill>
                {pending && onReviewRequest ? (
                  <Button size="xs" variant="secondary" onClick={() => onReviewRequest(request)}>
                    Review
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        {refunds.map((refund) => (
          <div
            key={`refund-${refund.id}`}
            className="flex items-start justify-between gap-3 rounded-xl border border-line-subtle bg-surface-utility/20 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-input-text">{formatCurrency(refund.amount)}</p>
              <p className="text-xs text-input-placeholder">
                {refund.createdAt ? formatLongDate(refund.createdAt) : 'Date unknown'}
              </p>
              {refund.reason ? (
                <p className="mt-1 text-xs text-input-placeholder">{refund.reason}</p>
              ) : null}
            </div>
            <Pill tone={refundTone(refund.status)}>{refund.status}</Pill>
          </div>
        ))}
      </div>
    </Panel>
  );
};
