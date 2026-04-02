import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';
import type { MajorAmount } from '@/shared/utils/money';
import { InvoicePreview } from '@/features/invoices/components/InvoicePreview';

type SendInvoiceDialogProps = {
  isOpen: boolean;
  totalAmount: MajorAmount;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
  /** When provided, an embedded InvoicePreview is shown inside the dialog body */
  lineItems?: InvoiceLineItem[];
  dueDate?: string;
  previewTitle?: string;
  previewReferenceLabel?: string | null;
  previewIssueDate?: string | Date | null;
  practiceName?: string | null;
  practiceLogoUrl?: string | null;
  practiceEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  billingIncrementMinutes?: number | null;
};

export const SendInvoiceDialog = ({
  isOpen,
  totalAmount,
  onConfirm,
  onCancel,
  loading = false,
  lineItems,
  dueDate,
  previewTitle,
  previewReferenceLabel,
  previewIssueDate,
  practiceName,
  practiceLogoUrl,
  practiceEmail,
  clientName,
  clientEmail,
  billingIncrementMinutes,
}: SendInvoiceDialogProps) => {
  const hasPreview = Array.isArray(lineItems) && lineItems.length > 0;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title="Send Invoice"
      description="Review the final amount before sending the invoice to your client."
      contentClassName={hasPreview ? 'max-w-3xl' : 'max-w-xl'}
      disableBackdropClick={loading}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-white/60 backdrop-blur-sm">
          <span className="text-sm font-medium text-gray-700">Processing…</span>
        </div>
      )}

      <DialogBody className="space-y-4">
        <div className="rounded-xl border border-line-glass/10 bg-white/[0.03] p-4">
          <p className="text-sm text-input-placeholder">Send this invoice now?</p>
          <p className="mt-1 text-base font-semibold text-input-text">
            Total due: {formatCurrency(totalAmount)}
          </p>
          <p className="mt-2 text-xs text-input-placeholder">
            You can update invoices until they are paid. The client will receive a receipt after payment.
          </p>
        </div>

        {/* Embedded invoice preview — visual confirmation before send */}
        {hasPreview && (
          <div className="rounded-xl border border-line-glass/20 bg-gray-50 p-3 overflow-y-auto max-h-[28rem]">
            <InvoicePreview
              title={previewTitle ?? 'Invoice'}
              referenceLabel={previewReferenceLabel}
              lineItems={lineItems || []}
              issueDate={previewIssueDate}
              dueDate={dueDate}
              practiceName={practiceName}
              practiceLogoUrl={practiceLogoUrl}
              practiceEmail={practiceEmail}
              clientName={clientName}
              clientEmail={clientEmail}
              billingIncrementMinutes={billingIncrementMinutes}
            />
          </div>
        )}

      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Continue Editing
        </Button>
        <Button
          onClick={() => {
            const result = onConfirm();
            if (result && typeof (result as Promise<void>).then === 'function') {
              return result as Promise<void>;
            }
          }}
          disabled={loading}
        >
          {loading ? 'Sending…' : 'Send invoice'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
