import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { toMajorUnits, type MinorAmount } from '@/shared/utils/money';
import {
  type IntakePaymentRequest
} from '@/shared/utils/intakePayments';

interface IntakePaymentCardProps {
  paymentRequest: IntakePaymentRequest;
  /** Override the card title. Defaults to "Consult fee". */
  title?: string;
  /** Override the body description. */
  description?: string;
}

const resolveDisplayAmount = (amount?: MinorAmount, currency?: string, locale?: string) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const normalizedCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  const displayAmount = toMajorUnits(amount) ?? 0;
  return formatCurrency(displayAmount, normalizedCurrency, locale || 'en');
};

/**
 * In-chat payment card per Intake.html `.pay-card`. Accent-tinted border,
 * gradient shadow, serif title + amount header, monospace trust line.
 * Click → opens Stripe Payment Link in a new tab.
 */
export const IntakePaymentCard: FunctionComponent<IntakePaymentCardProps> = ({
  paymentRequest,
  title = 'Consult fee',
  description = 'Charged securely via Stripe at consult time.',
}) => {
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const formattedAmount = useMemo(
    () => resolveDisplayAmount(paymentRequest.amount, paymentRequest.currency, locale),
    [paymentRequest.amount, paymentRequest.currency, locale]
  );

  const buttonLabel = formattedAmount
    ? `Pay ${formattedAmount} & book a time →`
    : 'Pay consultation fee';
  const hasUrl = Boolean(paymentRequest.paymentLinkUrl);

  const accentBorder = 'border-[color:color-mix(in_oklab,var(--accent)_40%,var(--rule))]';
  const accentShadow = 'shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_12px_28px_-16px_color-mix(in_oklab,var(--accent-deep)_50%,transparent)]';

  return (
    <div
      className={`mt-3 rounded-r-md border bg-card p-4 ${accentBorder} ${accentShadow}`}
      data-testid="intake-payment-card"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h4 className="m-0 font-serif text-[17px] font-normal leading-tight text-ink">{title}</h4>
        {formattedAmount ? (
          <div className="font-serif text-[24px] tracking-[-0.01em] tabular-nums text-ink">
            {formattedAmount}
          </div>
        ) : null}
      </div>
      <p className="m-0 mb-3 text-[13px] leading-relaxed text-dim">
        {description}
      </p>
      {hasUrl ? (
        <a
          href={paymentRequest.paymentLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary inline-flex w-full items-center justify-center rounded-r-md px-4 py-3.5 text-center font-semibold no-underline transition-all hover:opacity-90 active:scale-[0.98]"
        >
          {buttonLabel}
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-r-md bg-accent px-4 py-3.5 text-center font-semibold text-accent-ink opacity-70"
          title="Preview only"
        >
          {buttonLabel}
        </button>
      )}
      <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-pos" />
        funds held in trust · no auto-billing · pci-compliant
      </div>
    </div>
  );
};
