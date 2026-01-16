import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { loadStripe, type StripeElementsOptionsClientSecret } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { IntakePaymentForm } from '@/features/intake/components/IntakePaymentForm';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_KEY ?? '';
const stripePromise = STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : null;

const resolveQueryValue = (value?: string | string[]) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

export const IntakePaymentPage: FunctionComponent = () => {
  const location = useLocation();
  const clientSecret = resolveQueryValue(location.query?.client_secret ?? location.query?.clientSecret);
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
