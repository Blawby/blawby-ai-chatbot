import { useEffect, useState } from 'preact/hooks';
import { AlertTriangle } from 'lucide-preact';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { Textarea } from '@/shared/ui/input';

interface VoidInvoiceConfirmDialogProps {
  isOpen: boolean;
  invoiceNumber?: string | null;
  loading?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

export const VoidInvoiceConfirmDialog = ({
  isOpen,
  invoiceNumber,
  loading = false,
  onConfirm,
  onCancel,
}: VoidInvoiceConfirmDialogProps) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) setReason('');
  }, [isOpen]);

  const handleConfirm = () => {
    if (loading) return;
    void onConfirm(reason.trim());
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={
        <span className="flex items-center gap-2 text-accent-error-light">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          Void this invoice?
        </span>
      }
      description={
        invoiceNumber
          ? `Voiding ${invoiceNumber} is irreversible. The client will no longer be able to pay it.`
          : 'Voiding an invoice is irreversible. The client will no longer be able to pay it.'
      }
      contentClassName="max-w-lg"
      disableBackdropClick={loading}
    >
      <DialogBody className="space-y-4">
        <p className="text-sm text-input-placeholder">
          You can optionally record an internal reason. This stays inside your practice.
        </p>
        <Textarea
          label="Reason (optional)"
          value={reason}
          onChange={setReason}
          rows={3}
          placeholder="e.g. Issued in error"
          disabled={loading}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirm} disabled={loading}>
          {loading ? 'Voiding…' : 'Void invoice'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
