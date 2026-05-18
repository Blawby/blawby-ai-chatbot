import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { StripeElementsOptionsClientSecret } from '@stripe/stripe-js';
import { IntakePaymentForm } from '@/features/intake/components/IntakePaymentForm';
import type { MinorAmount } from '@/shared/utils/money';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_KEY || '';
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

interface PaymentPanelProps {
  elementsOptions: StripeElementsOptionsClientSecret;
  amount?: MinorAmount;
  currency?: string;
  intakeUuid?: string;
  conversationId?: string;
  onSuccess?: () => void;
}

export default function PaymentPanel({
  elementsOptions,
  amount,
  currency,
  intakeUuid,
  conversationId,
  onSuccess,
}: PaymentPanelProps) {
  if (!stripePromise) return null;
  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <IntakePaymentForm
        amount={amount}
        currency={currency}
        intakeUuid={intakeUuid}
        conversationId={conversationId}
        onSuccess={onSuccess}
        variant="plain"
      />
    </Elements>
  );
}
