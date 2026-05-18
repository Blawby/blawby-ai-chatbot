import { useState } from 'preact/hooks';
import { Dialog, DialogBody, DialogFooter, useDialogFormReset } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Textarea } from '@/shared/ui/input';
import { formatCurrency } from '@/shared/utils/currencyFormatter';

interface RefundRequestDialogProps {
  isOpen: boolean;
  maxAmount: number;
  loading?: boolean;
  invoiceNumber?: string | null;
  onSubmit: (payload: { amount?: number; reason: string }) => void | Promise<void>;
  onCancel: () => void;
}

export const RefundRequestDialog = ({
  isOpen,
  maxAmount,
  loading = false,
  invoiceNumber,
  onSubmit,
  onCancel,
}: RefundRequestDialogProps) => {
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useDialogFormReset({
    isOpen,
    reason: 'Cancelled refund workflow — clear draft on close.',
    reset: () => {
      setAmount(undefined);
      setReason('');
      setError(null);
    },
  });

  const handleSubmit = () => {
    if (loading) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Please provide a reason.');
      return;
    }
    if (amount !== undefined) {
      if (!Number.isFinite(amount) || amount <= 0) {
        setError('Amount must be a positive number.');
        return;
      }
      if (amount > maxAmount) {
        setError(`Amount cannot exceed ${formatCurrency(maxAmount)}.`);
        return;
      }
    }
    setError(null);
    void onSubmit({ amount, reason: trimmedReason });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title="Request refund"
      description={invoiceNumber ? `Submit a refund request for ${invoiceNumber}.` : 'Submit a refund request for review.'}
      contentClassName="max-w-lg"
      disableBackdropClick={loading}
    >
      <DialogBody className="space-y-4">
        <CurrencyInput
          label="Amount"
          value={amount}
          onChange={(next) => setAmount(next)}
          placeholder={`Up to ${formatCurrency(maxAmount)}`}
          disabled={loading}
          min={0}
        />
        <p className="text-xs text-input-placeholder">
          Leave blank to request a full refund of {formatCurrency(maxAmount)}.
        </p>
        <Textarea
          label="Reason"
          value={reason}
          onChange={(next) => setReason(next)}
          rows={3}
          placeholder="e.g. Service not rendered"
          disabled={loading}
        />
        {error ? (
          <p className="text-sm text-accent-error-light" role="alert">
            {error}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Submitting…' : 'Submit request'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
