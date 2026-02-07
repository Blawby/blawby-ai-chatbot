import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { toMajorUnits, type MinorAmount } from '@/shared/utils/money';
import {
  buildIntakePaymentUrl,
  isValidStripePaymentLink,
  isValidStripeCheckoutSessionUrl,
  type IntakePaymentRequest
} from '@/shared/utils/intakePayments';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';

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
  const { showError } = useToastContext();
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
    if (hasCheckoutSession && paymentRequest.checkoutSessionUrl) {
      const isValid = isValidStripeCheckoutSessionUrl(paymentRequest.checkoutSessionUrl);
      if (isValid) {
        if (onOpenPayment) {
          onOpenPayment(paymentRequest);
          return;
        }
        if (typeof window !== 'undefined') {
          window.open(paymentRequest.checkoutSessionUrl, '_blank', 'noopener');
          return;
        }
      } else {
        console.warn('[IntakePayment] Invalid Stripe checkout session URL detected. Redacted url.');
        
        // Attempt fallback methods
        let fallbackSucceeded = false;
        if (!hasClientSecret && paymentRequest.paymentLinkUrl && openPaymentLink()) {
          fallbackSucceeded = true;
        } else if (onOpenPayment) {
          onOpenPayment(paymentRequest);
          fallbackSucceeded = true;
        } else {
             // Try simple navigation to payment URL as last resort if it differs from checkout session
             if (paymentUrl && paymentUrl !== paymentRequest.checkoutSessionUrl) {
                 navigate(paymentUrl);
                 fallbackSucceeded = true;
             }
        }

        if (fallbackSucceeded) {
            showError('Payment link error', 'The checkout link appears to be invalid. We will try an alternative method.');
        } else {
             showError('Payment unavailable', 'The payment link is invalid and no alternative methods are available.');
        }
        return;
      }
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
