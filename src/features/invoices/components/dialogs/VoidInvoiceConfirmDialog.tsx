import { AlertTriangle } from 'lucide-preact';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';

interface VoidInvoiceConfirmDialogProps {
  isOpen: boolean;
  invoiceNumber?: string | null;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const VoidInvoiceConfirmDialog = ({
  isOpen,
  invoiceNumber,
  loading = false,
  onConfirm,
  onCancel,
}: VoidInvoiceConfirmDialogProps) => {
  const handleConfirm = async () => {
    if (loading) return;
    await onConfirm();
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
      <DialogBody>
        <p className="text-sm text-dim-2">
          Once voided, the invoice cannot be sent or paid. You can still view it in the invoice list.
        </p>
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
