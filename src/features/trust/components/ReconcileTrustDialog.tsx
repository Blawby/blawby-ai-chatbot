import type { FunctionComponent } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';

import { trustReadinessApi, type TrustReadiness } from '@/features/trust/services/trustReadinessApi';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { Button } from '@/shared/ui/Button';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { CurrencyInput, Input, Textarea } from '@/shared/ui/input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatCurrency } from '@/shared/utils/currencyFormatter';

interface ReconcileTrustDialogProps {
  practiceId: string | null;
  readiness: TrustReadiness | null;
  isOpen: boolean;
  onClose: () => void;
  onReconciled: () => void | Promise<void>;
}

const todayUtc = (): string => new Date().toISOString().slice(0, 10);

const createIdempotencyKey = (): string => {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('This browser cannot create a reconciliation request ID.');
  }
  return crypto.randomUUID();
};

export const ReconcileTrustDialog: FunctionComponent<ReconcileTrustDialogProps> = ({
  practiceId,
  readiness,
  isOpen,
  onClose,
  onReconciled,
}) => {
  const { showError, showSuccess } = useToastContext();
  const [statementDate, setStatementDate] = useState(todayUtc());
  const [bankBalance, setBankBalance] = useState<number | undefined>();
  const [bookBalance, setBookBalance] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStatementDate(todayUtc());
    setBankBalance(undefined);
    setBookBalance(undefined);
    setNotes('');
    setValidationError(null);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (!submitting) onClose();
  }, [onClose, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!practiceId) return;
    if (!statementDate || bankBalance === undefined || bookBalance === undefined) {
      setValidationError('Statement date, bank balance, and trust-book balance are required.');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      const result = await trustReadinessApi.reconcile(practiceId, {
        idempotency_key: createIdempotencyKey(),
        statement_ending_at: new Date(`${statementDate}T23:59:59.999Z`).toISOString(),
        bank_statement_balance: Math.round(bankBalance * 100),
        trust_book_balance: Math.round(bookBalance * 100),
        notes: notes.trim() || undefined,
      });
      await onReconciled();
      showSuccess(
        result.status === 'balanced' ? 'Trust account balanced' : 'Reconciliation recorded with variance',
        result.status === 'balanced'
          ? 'Bank statement, trust books, and client ledgers agree.'
          : 'Review the two variance amounts before moving or distributing funds.',
      );
      onClose();
    } catch (error) {
      showError('Could not record reconciliation', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }, [bankBalance, bookBalance, notes, onClose, onReconciled, practiceId, showError, showSuccess, statementDate]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Record trust reconciliation"
      description="Compare three independent balances. This creates immutable compliance evidence; it does not move funds."
      disableBackdropClick={submitting}
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line-subtle bg-paper-2 px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-dim">Client-ledger snapshot</span>
            <strong className="mt-1 block font-mono text-lg tabular-nums text-ink">
              {readiness ? formatCurrency(readiness.ledger.client_ledger_balance / 100) : 'Unavailable'}
            </strong>
            <p className="mt-1 text-xs text-dim-2">Calculated by Blawby from the latest balance for every client and matter.</p>
          </div>
          <Input
            type="date"
            label="Statement ending date"
            value={statementDate}
            onChange={setStatementDate}
            disabled={submitting}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <CurrencyInput
              label="Bank statement balance"
              description="Ending balance printed on the trust bank statement."
              value={bankBalance}
              onChange={setBankBalance}
              disabled={submitting}
              required
            />
            <CurrencyInput
              label="Trust-book balance"
              description="Independent balance from the practice trust-account books."
              value={bookBalance}
              onChange={setBookBalance}
              disabled={submitting}
              required
            />
          </div>
          <Textarea
            label="Notes"
            value={notes}
            onChange={setNotes}
            rows={3}
            maxLength={2000}
            placeholder="Statement reference or variance follow-up"
            disabled={submitting}
          />
          {validationError ? <p className="text-sm text-neg" role="alert">{validationError}</p> : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={submitting || !practiceId || !readiness}>
          {submitting ? (
            <span className="mr-1.5 inline-flex"><LoadingSpinner size="sm" ariaLabel="Recording reconciliation" announce={false} /></span>
          ) : null}
          Record reconciliation
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

export { createIdempotencyKey };
