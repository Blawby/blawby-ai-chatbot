import { useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { reportsApi } from '@/features/reports/services/reportsApi';

interface SendNowModalProps {
  isOpen: boolean;
  onClose: () => void;
  practiceId: string;
  reportType: string;
  filters: Record<string, string>;
  onSent?: () => void;
}

export const SendNowModal: FunctionComponent<SendNowModalProps> = ({
  isOpen,
  onClose,
  practiceId,
  reportType,
  filters,
  onSent,
}) => {
  const [recipientsInput, setRecipientsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showError, showSuccess } = useToastContext();

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const recipients = recipientsInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      await reportsApi.sendNow(practiceId, { reportType, recipients, filters });
      showSuccess('Report sent', 'View it in Deliveries.');
      onSent?.();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Send report now">
      <DialogBody>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-input-placeholder">
            Generate this report now and store it under Deliveries. Optionally notify recipients.
          </p>
          <Input
            label="Recipients (user IDs, comma-separated, optional)"
            value={recipientsInput}
            onChange={setRecipientsInput}
            placeholder="user_123, user_456"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <span className="mr-2 inline-flex">
              <LoadingSpinner size="sm" ariaLabel="Sending report" announce={false} />
            </span>
          ) : null}
          Send
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

export default SendNowModal;
