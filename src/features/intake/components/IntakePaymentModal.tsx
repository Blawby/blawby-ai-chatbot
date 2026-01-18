import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptionsClientSecret } from '@stripe/stripe-js';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { isValidStripePaymentLink } from '@/shared/utils/intakePayments';
import { IntakePaymentForm } from '@/features/intake/components/IntakePaymentForm';
import { Button } from '@/shared/ui/Button';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_KEY ?? '';
const stripePromise = STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : null;

interface IntakePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentRequest: IntakePaymentRequest | null;
  onSuccess?: () => void;
}

export const IntakePaymentModal: FunctionComponent<IntakePaymentModalProps> = ({
  isOpen,
  onClose,
  paymentRequest,
  onSuccess
}) => {
  const clientSecret = paymentRequest?.clientSecret;
  const paymentLinkUrl = paymentRequest?.paymentLinkUrl;
  const isValidPaymentLink = paymentLinkUrl ? isValidStripePaymentLink(paymentLinkUrl) : false;

  const elementsOptions = useMemo<StripeElementsOptionsClientSecret | null>(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#2563eb',
          colorText: '#0f172a',
          colorBackground: '#ffffff',
          colorDanger: '#dc2626',
          fontFamily: 'ui-sans-serif, system-ui',
          borderRadius: '12px'
        }
      }
    };
  }, [clientSecret]);

  if (!paymentRequest && !isOpen) {
    return null;
  }

  const returnTo = paymentRequest?.returnTo || '/';

  const canUseElements = Boolean(clientSecret && elementsOptions && STRIPE_PUBLIC_KEY && stripePromise);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Consultation fee"
      type="drawer"
    >
      {!paymentRequest ? (
        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card-bg px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          Loading payment details…
        </div>
      ) : canUseElements ? (
        <Elements key={clientSecret} stripe={stripePromise} options={elementsOptions}>
          <IntakePaymentForm
            practiceName={paymentRequest.practiceName || 'The practice'}
            amount={paymentRequest.amount}
            currency={paymentRequest.currency}
            intakeUuid={paymentRequest.intakeUuid}
            practiceId={paymentRequest.practiceId}
            conversationId={paymentRequest.conversationId}
            returnTo={returnTo}
            onSuccess={onSuccess}
            onReturn={onClose}
          />
        </Elements>
      ) : isValidPaymentLink ? (
        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
          <p className="mb-3">Continue to Stripe to complete your consultation fee.</p>
          <Button
            variant="primary"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.open(paymentLinkUrl, '_blank', 'noopener');
              }
            }}
          >
            Open secure payment
          </Button>
        </div>
      ) : !STRIPE_PUBLIC_KEY || !stripePromise ? (
        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card-bg px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          Payments are unavailable right now. Please try again later.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card-bg px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          Missing payment details. Please return to the intake chat and try again.
        </div>
      )}
    </Modal>
  );
};
