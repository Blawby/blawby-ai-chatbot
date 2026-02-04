import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { toMajorUnits, type MinorAmount } from '@/shared/utils/money';
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

const resolveDisplayAmount = (amount?: MinorAmount, currency?: string, locale?: string) => {
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
  const hasCheckoutSession = typeof paymentRequest.checkoutSessionUrl === 'string' &&
    paymentRequest.checkoutSessionUrl.trim().length > 0;

  const paymentUrl = buildIntakePaymentUrl(paymentRequest);
  const buttonLabel = formattedAmount ? `Pay ${formattedAmount}` : 'Pay consultation fee';

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
    if (hasCheckoutSession && onOpenPayment) {
      onOpenPayment(paymentRequest);
      return;
    }
    if (hasCheckoutSession && typeof window !== 'undefined' && paymentRequest.checkoutSessionUrl) {
      window.open(paymentRequest.checkoutSessionUrl, '_blank', 'noopener');
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
    <div className="mt-4">
      <Button
        variant="primary"
        onClick={handlePay}
        className="w-full"
      >
        {buttonLabel}
      </Button>
    </div>
  );
};
