import { useState } from 'preact/hooks';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { Textarea } from '@/shared/ui/input';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import {
  executePracticeRefund,
  reviewPracticeRefundRequest,
} from '@/features/invoices/services/invoicesService';
import type { InvoiceRefundRequestEvent } from '@/features/invoices/types';
import { RefundRequestStatusBadge } from './RefundRequestStatusBadge';

interface RefundRequestReviewDialogProps {
  isOpen: boolean;
  practiceId: string;
  request: InvoiceRefundRequestEvent | null;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
}

type Stage = 'review' | 'execute';

export const RefundRequestReviewDialog = ({
  isOpen,
  practiceId,
  request,
  onClose,
  onCompleted,
}: RefundRequestReviewDialogProps) => {
  const { showError, showSuccess } = useToastContext();
  const [stage, setStage] = useState<Stage>('review');
  const [declineMode, setDeclineMode] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  if (!request) return null;

  const handleApprove = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await reviewPracticeRefundRequest(practiceId, request.id, {
        decision: 'approve',
        note: note.trim() || undefined,
      });
      showSuccess('Refund approved', 'The refund is approved. You can execute it now.');
      setStage('execute');
      await onCompleted();
    } catch (err) {
      showError('Approval failed', err instanceof Error ? err.message : 'Failed to approve refund request');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    if (loading) return;
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      showError('Decline reason required', 'Please provide a reason for declining the refund.');
      return;
    }
    setLoading(true);
    try {
      await reviewPracticeRefundRequest(practiceId, request.id, {
        decision: 'decline',
        note: trimmedNote,
      });
      showSuccess('Refund declined', 'The refund request has been declined.');
      onClose();
      await onCompleted();
    } catch (err) {
      showError('Decline failed', err instanceof Error ? err.message : 'Failed to decline refund request');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await executePracticeRefund(practiceId, request.id);
      showSuccess('Refund executed', 'The refund has been issued through Stripe.');
      onClose();
      await onCompleted();
    } catch (err) {
      showError('Execution failed', err instanceof Error ? err.message : 'Failed to execute refund');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={stage === 'execute' ? 'Execute refund?' : 'Review refund request'}
      contentClassName="max-w-lg"
      disableBackdropClick={loading}
    >
      <DialogBody className="space-y-4">
        <div className="rounded-xl border border-line-glass/20 bg-surface-utility/30 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-input-placeholder">Amount</span>
            <span className="font-semibold text-input-text">
              {request.amount != null ? formatCurrency(request.amount) : 'Full refund'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-input-placeholder">Requested</span>
            <span className="text-input-text">
              {request.createdAt ? formatLongDate(request.createdAt) : '—'}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-input-placeholder">Status</span>
            <RefundRequestStatusBadge status={request.status} />
          </div>
          {request.reason ? (
            <div className="mt-3 border-t border-line-glass/20 pt-3">
              <p className="text-xs text-input-placeholder">Reason</p>
              <p className="mt-1 text-input-text">{request.reason}</p>
            </div>
          ) : null}
        </div>

        {stage === 'review' ? (
          <Textarea
            label={declineMode ? 'Decline reason (required)' : 'Internal note (optional)'}
            value={note}
            onChange={setNote}
            rows={3}
            placeholder={declineMode ? 'Tell the client why this was declined' : 'Add an internal note'}
            disabled={loading}
          />
        ) : (
          <p className="text-sm text-input-placeholder">
            Approve completed. Execute now to issue the refund through Stripe, or close to execute later.
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        {stage === 'review' ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            {declineMode ? (
              <Button variant="danger" onClick={() => void handleDecline()} disabled={loading}>
                {loading ? 'Declining…' : 'Decline'}
              </Button>
            ) : (
              <>
                <Button variant="danger-ghost" onClick={() => setDeclineMode(true)} disabled={loading}>
                  Decline
                </Button>
                <Button onClick={() => void handleApprove()} disabled={loading}>
                  {loading ? 'Approving…' : 'Approve'}
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Later
            </Button>
            <Button onClick={() => void handleExecute()} disabled={loading}>
              {loading ? 'Executing…' : 'Execute refund'}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
};
