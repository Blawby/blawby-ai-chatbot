import { FunctionComponent } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { loadStripe, type StripeElementsOptionsClientSecret } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { IntakePaymentForm } from '@/features/intake/components/IntakePaymentForm';
import { Button } from '@/shared/ui/Button';
import {
  fetchIntakePaymentStatus,
  isPaidIntakeStatus,
  isValidStripePaymentLink
} from '@/shared/utils/intakePayments';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_KEY ?? '';
const stripePromise = STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : null;

const resolveQueryValue = (value?: string | string[]) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

export const IntakePaymentPage: FunctionComponent = () => {
  const location = useLocation();
  const clientSecret = resolveQueryValue(location.query?.client_secret ?? location.query?.clientSecret);
  const paymentLinkUrl = resolveQueryValue(location.query?.payment_link_url ?? location.query?.paymentLinkUrl);
  const amountRaw = resolveQueryValue(location.query?.amount);
  const currency = resolveQueryValue(location.query?.currency);
  const practiceName = resolveQueryValue(location.query?.practice) || 'the practice';
  const practiceId = resolveQueryValue(location.query?.practiceId);
  const conversationId = resolveQueryValue(location.query?.conversationId);
  const intakeUuid = resolveQueryValue(location.query?.uuid);
  const rawReturnTo = resolveQueryValue(location.query?.return_to) || '/';
  const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
    ? rawReturnTo
    : '/';

  const amount = amountRaw ? Number(amountRaw) : undefined;
  const [status, setStatus] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckStatus = useCallback(async () => {
    if (!intakeUuid) return;
    setIsChecking(true);
    try {
      const latestStatus = await fetchIntakePaymentStatus(intakeUuid);
      if (latestStatus) {
        setStatus(latestStatus);
      } else {
        setStatus('unable_to_fetch');
      }
    } catch (error) {
      console.warn('[IntakePayment] Failed to check payment status', error);
      setStatus('unable_to_fetch');
    } finally {
      setIsChecking(false);
    }
  }, [intakeUuid]);

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
          fontFamily: '"Space Grotesk", ui-sans-serif, system-ui',
          borderRadius: '12px'
        }
      }
    };
  }, [clientSecret]);

  if (paymentLinkUrl && isValidStripePaymentLink(paymentLinkUrl) && !clientSecret) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Complete your intake</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Continue to Stripe to complete your consultation fee for {practiceName}.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
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
            {intakeUuid && (
              <Button
                variant="secondary"
                onClick={handleCheckStatus}
                disabled={isChecking}
              >
                {isChecking ? 'Checking status...' : 'Check payment status'}
              </Button>
            )}
          </div>
          {status && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              isPaidIntakeStatus(status)
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200'
            }`}>
              Payment status: {status}.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!STRIPE_PUBLIC_KEY) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-6 text-sm text-amber-900 dark:text-amber-100">
          Stripe is not configured. Set `VITE_STRIPE_KEY` to enable payments.
        </div>
      </div>
    );
  }

  if (!clientSecret || !elementsOptions || !stripePromise) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
          Missing payment details. Please return to the intake chat and try again.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Complete your intake</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Securely submit your consultation fee to continue with {practiceName}.
          </p>
        </div>
        <Elements stripe={stripePromise} options={elementsOptions}>
          <IntakePaymentForm
            practiceName={practiceName}
            amount={Number.isFinite(amount) ? amount : undefined}
            currency={currency}
            intakeUuid={intakeUuid}
            practiceId={practiceId}
            conversationId={conversationId}
            returnTo={returnTo}
          />
        </Elements>
      </div>
    </div>
  );
};
