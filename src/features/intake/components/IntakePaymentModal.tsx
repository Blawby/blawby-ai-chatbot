import { FunctionComponent } from 'preact';
import { useMemo, useEffect, useState, useRef } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptionsClientSecret } from '@stripe/stripe-js';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import {
  isValidStripePaymentLink,
  isValidStripeCheckoutSessionUrl,
  fetchIntakePaymentStatus,
  isPaidIntakeStatus
} from '@/shared/utils/intakePayments';
import { IntakePaymentForm } from '@/features/intake/components/IntakePaymentForm';
import { Button } from '@/shared/ui/Button';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_KEY ?? '';
const stripePromise = STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : null;

interface IntakePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentRequest: IntakePaymentRequest | null;
  onSuccess?: () => void | Promise<void>;
}

export const IntakePaymentModal: FunctionComponent<IntakePaymentModalProps> = ({
  isOpen,
  onClose,
  paymentRequest,
  onSuccess
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const clientSecret = paymentRequest?.clientSecret;
  const paymentLinkUrl = paymentRequest?.paymentLinkUrl;
  const checkoutSessionUrl = paymentRequest?.checkoutSessionUrl;
  const isValidPaymentLink = paymentLinkUrl ? isValidStripePaymentLink(paymentLinkUrl) : false;
  const isValidCheckoutSession = checkoutSessionUrl ? isValidStripeCheckoutSessionUrl(checkoutSessionUrl) : false;

  const isVerifyingRef = useRef(false);
  useEffect(() => {
    if (!isOpen || !paymentRequest?.intakeUuid) return;

    const handleFocus = async () => {
      if (isVerifyingRef.current) return;
      isVerifyingRef.current = true;
      setIsVerifying(true);
      try {
        const status = await fetchIntakePaymentStatus(paymentRequest.intakeUuid);
        if (isPaidIntakeStatus(status)) {
          if (onSuccess) {
            await Promise.resolve(onSuccess());
          }
          onClose();
        }
      } catch (err) {
        console.warn('[IntakePaymentModal] Focus-triggered status check failed', err);
      } finally {
        isVerifyingRef.current = false;
        setIsVerifying(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isOpen, paymentRequest?.intakeUuid, onSuccess, onClose]);

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

  const canUseElements = Boolean(clientSecret && elementsOptions && STRIPE_PUBLIC_KEY && stripePromise);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Complete Payment"
      type="drawer"
    >
      {canUseElements ? (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <IntakePaymentForm
            amount={paymentRequest.amount}
            currency={paymentRequest.currency}
            intakeUuid={paymentRequest.intakeUuid}
            practiceId={paymentRequest.practiceId}
            conversationId={paymentRequest.conversationId}
            onSuccess={onSuccess}
          />
        </Elements>
      ) : isValidCheckoutSession ? (
        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
          <p className="mb-4 text-gray-600 dark:text-gray-300">
            One more step: click below to complete your payment on Stripe&apos;s secure checkout page.
          </p>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              if (typeof window !== 'undefined' && checkoutSessionUrl) {
                window.open(checkoutSessionUrl, '_blank', 'noopener');
              }
            }}
          >
            {isVerifying ? 'Verifying...' : 'Complete payment'}
          </Button>
        </div>
      ) : isValidPaymentLink ? (
        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-4 py-4 text-sm text-gray-700 dark:text-gray-200">
          <Button
            variant="primary"
            className="w-full"
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
