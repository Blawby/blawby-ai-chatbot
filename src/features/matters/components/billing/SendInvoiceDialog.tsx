import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { MajorAmount } from '@/shared/utils/money';

type SendInvoiceDialogProps = {
  isOpen: boolean;
  totalAmount: MajorAmount;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
};

export const SendInvoiceDialog = ({
  isOpen,
  totalAmount,
  onConfirm,
  onCancel,
  loading = false
}: SendInvoiceDialogProps) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    title="Send Invoice"
    contentClassName="max-w-xl"
  >
    <div className="space-y-4">
      <p className="text-sm text-input-placeholder">
        You are about to send this invoice to the client.
      </p>
      <p className="text-sm font-semibold text-input-text">
        Total due: {formatCurrency(totalAmount)}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => void onConfirm()} disabled={loading}>
          {loading ? 'Sending...' : 'Send invoice'}
        </Button>
      </div>
    </div>
  </Modal>
);
