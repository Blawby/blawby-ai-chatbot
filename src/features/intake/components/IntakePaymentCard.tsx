import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { toMajorUnits } from '@/shared/utils/moneyNormalization';
import {
  buildIntakePaymentUrl,
  isValidStripePaymentLink,
  type IntakePaymentRequest
} from '@/shared/utils/intakePayments';
import { useNavigation } from '@/shared/utils/navigation';

interface IntakePaymentCardProps {
  paymentRequest: IntakePaymentRequest;
  onOpenPayment?: (request: IntakePaymentRequest) => void;
}

const resolveDisplayAmount = (amount?: number, currency?: string, locale?: string) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const normalizedCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  const displayAmount = toMajorUnits(amount) ?? 0;
  return formatCurrency(displayAmount, normalizedCurrency, locale || 'en');
};

export const IntakePaymentCard: FunctionComponent<IntakePaymentCardProps> = ({ paymentRequest, onOpenPayment }) => {
  const { navigate } = useNavigation();
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const formattedAmount = useMemo(
    () => resolveDisplayAmount(paymentRequest.amount, paymentRequest.currency, locale),
    [paymentRequest.amount, paymentRequest.currency, locale]
  );
  const hasClientSecret = typeof paymentRequest.clientSecret === 'string' &&
    paymentRequest.clientSecret.trim().length > 0;

  const practiceName = paymentRequest.practiceName || 'the practice';
  const paymentUrl = buildIntakePaymentUrl(paymentRequest);

  const openPaymentLink = () => {
    if (!paymentRequest.paymentLinkUrl) return false;
    if (!isValidStripePaymentLink(paymentRequest.paymentLinkUrl)) {
      return false;
    }
    if (typeof window !== 'undefined') {
      window.open(paymentRequest.paymentLinkUrl, '_blank', 'noopener');
      return true;
    }
    return false;
  };

  const handlePay = () => {
    if (hasClientSecret && onOpenPayment) {
      onOpenPayment(paymentRequest);
      return;
    }
    if (!hasClientSecret && paymentRequest.paymentLinkUrl && openPaymentLink()) {
      return;
    }
    if (onOpenPayment) {
      onOpenPayment(paymentRequest);
      return;
    }
    navigate(paymentUrl);
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-5 py-4 text-left shadow-sm">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">Consultation fee required</div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {formattedAmount
          ? `${practiceName} requests a ${formattedAmount} consultation fee to continue.`
          : `${practiceName} requests a consultation fee to continue.`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={handlePay}
        >
          Pay consultation fee
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Secure payment powered by Stripe.
        </span>
      </div>
    </div>
  );
};
