import { useCallback, useEffect, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';

import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { Seg, type SegOption } from '@/design-system/patterns';
import { reportsApi } from '@/features/reports/services/reportsApi';
import { useToastContext } from '@/shared/contexts/ToastContext';

type CpaFrequency = 'monthly' | 'quarterly';

const FREQUENCY_OPTIONS: ReadonlyArray<SegOption<CpaFrequency>> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

/**
 * Map our user-facing frequency to a backend schedule payload. The
 * worker schedule API supports daily/weekly/monthly only — quarterly
 * is currently shaped as a monthly schedule on the 1st with the report
 * filter set to `period: 'quarter'`, so the CPA still receives a
 * three-month rollup every delivery.
 *
 * TODO(backend): add `quarterly` (and `yearly`) frequencies to the
 * schedule API so we don't have to send a monthly schedule with a
 * quarter-window filter.
 */
const buildSchedulePayload = (
  reportType: string,
  frequency: CpaFrequency,
  recipients: string[],
): {
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfMonth?: number;
  hourUtc: number;
  recipients: string[];
  filters: Record<string, string>;
  active: boolean;
} => ({
  reportType,
  frequency: 'monthly',
  dayOfMonth: 1,
  hourUtc: 9,
  recipients,
  filters: { period: frequency === 'quarterly' ? 'quarter' : 'month' },
  active: true,
});

const cpaEmailStorageKey = (practiceId: string) =>
  `blawby:trust:cpa_email:${practiceId}`;

const cpaFrequencyStorageKey = (practiceId: string) =>
  `blawby:trust:cpa_frequency:${practiceId}`;

interface EmailCpaDialogProps {
  practiceId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Dialog used by the Trust header "Email to CPA quarterly" CTA.
 *
 * Wires the schedule create endpoint with a recipients list of one (the
 * CPA email entered here). The email is persisted to localStorage as a
 * demo until the practice profile exposes `practices.cpa_email`.
 *
 * TODO(backend): persist `practices.cpa_email` so we can pre-fill on
 * load and update it without a separate dialog.
 */
export const EmailCpaDialog: FunctionComponent<EmailCpaDialogProps> = ({
  practiceId,
  isOpen,
  onClose,
}) => {
  const { showSuccess, showError } = useToastContext();
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<CpaFrequency>('quarterly');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Hydrate from localStorage whenever we open with a practiceId.
  useEffect(() => {
    if (!isOpen || !practiceId || typeof window === 'undefined') return;
    try {
      const storedEmail = window.localStorage.getItem(cpaEmailStorageKey(practiceId));
      const storedFrequency = window.localStorage.getItem(cpaFrequencyStorageKey(practiceId));
      if (storedEmail) setEmail(storedEmail);
      if (storedFrequency === 'monthly' || storedFrequency === 'quarterly') {
        setFrequency(storedFrequency);
      }
    } catch {
      // Privacy mode / quota — fall through to empty state.
    }
  }, [isOpen, practiceId]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setValidationError(null);
    onClose();
  }, [onClose, submitting]);

  const handleConfirm = useCallback(async () => {
    if (!practiceId) return;
    const trimmed = email.trim();
    // Simple-but-decent email check — anything more strict belongs on the
    // backend, where it can match the address it actually sends to.
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setValidationError('Enter a valid email address');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await reportsApi.createSchedule(
        practiceId,
        buildSchedulePayload('trust-ledger', frequency, [trimmed]),
      );
      // Persist the email + frequency for next time.
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(cpaEmailStorageKey(practiceId), trimmed);
          window.localStorage.setItem(cpaFrequencyStorageKey(practiceId), frequency);
        } catch {
          // Ignore storage errors.
        }
      }
      showSuccess(
        'CPA schedule saved',
        `Trust ledger will be emailed to ${trimmed} every ${frequency === 'quarterly' ? 'quarter' : 'month'}.`,
      );
      onClose();
    } catch (err) {
      showError(
        'Could not save schedule',
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [email, frequency, onClose, practiceId, showError, showSuccess]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Email trust ledger to CPA"
      description="Set the address and cadence — Blawby will deliver the trust ledger report on schedule."
      disableBackdropClick={submitting}
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          <div>
            <Input
              label="CPA email"
              type="email"
              placeholder="cpa@example.com"
              value={email}
              onChange={(value) => {
                setEmail(value);
                if (validationError) setValidationError(null);
              }}
              error={validationError ?? undefined}
              required
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
              Frequency
            </span>
            <Seg<CpaFrequency>
              value={frequency}
              options={FREQUENCY_OPTIONS}
              ariaLabel="Delivery frequency"
              onChange={setFrequency}
              disabled={submitting}
            />
            {frequency === 'quarterly' ? (
              <p className="text-xs text-dim-2">
                Deliveries run on the 1st of each month at 09:00 UTC with a three-month
                rollup window.
              </p>
            ) : (
              <p className="text-xs text-dim-2">
                Deliveries run on the 1st of each month at 09:00 UTC and cover the prior
                calendar month.
              </p>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={submitting || !practiceId}
        >
          {submitting && (
            <span className="mr-1.5 inline-flex">
              <LoadingSpinner size="sm" ariaLabel="Saving schedule" announce={false} />
            </span>
          )}
          Save schedule
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

export default EmailCpaDialog;
