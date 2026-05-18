import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { toMajorUnits, type MinorAmount } from '@/shared/utils/money';
import {
  type IntakePaymentRequest
} from '@/shared/utils/intakePayments';

interface IntakePaymentCardProps {
  paymentRequest: IntakePaymentRequest;
}

const resolveDisplayAmount = (amount?: MinorAmount, currency?: string, locale?: string) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const normalizedCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  const displayAmount = toMajorUnits(amount) ?? 0;
  return formatCurrency(displayAmount, normalizedCurrency, locale || 'en');
};

export const IntakePaymentCard: FunctionComponent<IntakePaymentCardProps> = ({ paymentRequest }) => {
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const formattedAmount = useMemo(
    () => resolveDisplayAmount(paymentRequest.amount, paymentRequest.currency, locale),
    [paymentRequest.amount, paymentRequest.currency, locale]
  );

  const buttonLabel = formattedAmount ? `Pay ${formattedAmount}` : 'Pay consultation fee';

  return (
    <div className="mt-4">
      {paymentRequest.paymentLinkUrl ? (
        <a
          href={paymentRequest.paymentLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary w-full text-center no-underline inline-flex items-center justify-center h-10 px-4 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
        >
          {buttonLabel}
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex h-10 w-full cursor-not-allowed items-center justify-center rounded-xl bg-accent-500 px-4 text-center font-semibold text-[rgb(var(--accent-foreground))] opacity-70"
          title="Preview only"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
};
