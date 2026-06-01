import { FunctionComponent } from 'preact';
import { CreditCard } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface IntakePaymentSummaryProps {
  /** Charged amount in minor units (cents). */
  amountCents: number | null;
  /** Currency code (e.g. "USD"). */
  currency: string;
  /** Stripe charge id (e.g. "ch_3Q9wRrAB"). */
  stripeChargeId: string | null;
  /** Whether the payment was actually captured. */
  paid: boolean;
  /** Refund window string (TODO(backend): real refund window from Stripe). */
  refundWindow?: string;
  className?: string;
}

function formatAmount(cents: number | null, currency: string): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/**
 * Right-column payment card — promotes the consult-fee summary from a chip
 * to a dedicated card per the Intakes.html spec.
 *
 * TODO(backend): refund-window is not currently surfaced by intake API;
 * defaults to "refundable until consult ends".
 */
export const IntakePaymentSummary: FunctionComponent<IntakePaymentSummaryProps> = ({
  amountCents,
  currency,
  stripeChargeId,
  paid,
  refundWindow = 'refundable until consult ends · credited toward retainer',
  className,
}) => {
  const amountLabel = formatAmount(amountCents, currency);

  if (amountCents == null) {
    return (
      <section
        className={cn('rounded-r-md border border-card-border bg-card', className)}
        aria-label="Payment summary"
      >
        <div className="flex items-center justify-between border-b border-line-subtle bg-paper-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon icon={CreditCard} className="h-4 w-4 text-dim-2" />
            <h4 className="font-serif text-sm font-normal tracking-tight text-ink">Payment</h4>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            no fee
          </span>
        </div>
        <p className="px-4 py-4 text-xs text-dim-2">
          No consultation fee was collected for this intake.
        </p>
      </section>
    );
  }

  return (
    <section
      className={cn('rounded-r-md border border-card-border bg-card', className)}
      aria-label="Payment summary"
    >
      <div className="flex items-center justify-between border-b border-line-subtle bg-paper-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon icon={CreditCard} className="h-4 w-4 text-dim-2" />
          <h4 className="font-serif text-sm font-normal tracking-tight text-ink">Payment</h4>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          consult fee
        </span>
      </div>
      <dl className="divide-y divide-line-subtle">
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-xs text-dim-2">{paid ? 'Consult fee paid' : 'Consult fee due'}</dt>
          <dd className="font-mono text-sm font-medium text-ink">{amountLabel}</dd>
        </div>
        {stripeChargeId ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-xs text-dim-2">Stripe ID</dt>
            <dd className="truncate font-mono text-[11px] text-dim">{stripeChargeId}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-xs text-dim-2">Held in</dt>
          <dd className="font-mono text-[11px] text-ink-2">IOLTA trust</dd>
        </div>
      </dl>
      <div className="border-t border-line-subtle px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-dim-2">
          {refundWindow}
        </span>
      </div>
    </section>
  );
};

export default IntakePaymentSummary;
