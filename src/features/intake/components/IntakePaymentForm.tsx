import { FunctionComponent } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { Button } from '@/shared/ui/Button';
import { getPracticeClientIntakeStatusEndpoint } from '@/config/api';

interface IntakePaymentFormProps {
  practiceName: string;
  amount?: number;
  currency?: string;
  intakeUuid?: string;
  returnTo: string;
  onSuccess?: () => void;
  onReturn?: () => void;
}

const formatIntakeAmount = (amount?: number, currency?: string, locale?: string) => {
  if (typeof amount !== 'number') return null;
  const normalizedCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  return formatCurrency(amount / 100, normalizedCurrency, locale || 'en');
};

export const IntakePaymentForm: FunctionComponent<IntakePaymentFormProps> = ({
  practiceName,
  amount,
  currency,
  intakeUuid,
  returnTo,
  onSuccess,
  onReturn
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'succeeded'>('idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const formattedAmount = useMemo(
    () => formatIntakeAmount(amount, currency, locale),
    [amount, currency, locale]
  );

  const pollIntakeStatus = useCallback(async () => {
    if (!intakeUuid) return null;
    try {
      const response = await fetch(getPracticeClientIntakeStatusEndpoint(intakeUuid), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json() as {
        success?: boolean;
        data?: { status?: string };
      };

      return payload.data?.status ?? null;
    } catch (error) {
      console.warn('[IntakePayment] Failed to fetch intake status', error);
      return null;
    }
  }, [intakeUuid]);

  const wait = useCallback((ms: number) => new Promise(resolve => setTimeout(resolve, ms)), []);

  const handleSubmit = useCallback(async (event: Event) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusDetail(null);

    if (!stripe || !elements) {
      setErrorMessage('Payment form is still loading. Please wait a moment.');
      return;
    }

    setIsSubmitting(true);
    setStatus('processing');

    try {
      const returnUrl = typeof window !== 'undefined'
        ? window.location.href
        : undefined;

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
        redirect: 'if_required'
      });

      if (result.error) {
        setErrorMessage(result.error.message || 'Payment failed. Please try again.');
        setStatus('idle');
        return;
      }

      if (result.paymentIntent?.status === 'succeeded') {
        setPaymentSubmitted(true);
        setStatus('processing');
      }

      const maxAttempts = 6;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const latestStatus = await pollIntakeStatus();
        if (latestStatus) {
          setStatusDetail(latestStatus);
          if (latestStatus === 'succeeded') {
            setStatus('succeeded');
            if (typeof window !== 'undefined' && intakeUuid) {
              try {
                const payload = {
                  practiceName,
                  amount,
                  currency
                };
                window.sessionStorage.setItem(
                  `intakePaymentSuccess:${intakeUuid}`,
                  JSON.stringify(payload)
                );
              } catch {
                // sessionStorage may be unavailable in private browsing.
              }
            }
            onSuccess?.();
            return;
          }
        }
        await wait(1500);
      }

      setErrorMessage(
        'Payment is being verified. Please wait a moment and refresh, or contact support if the issue persists.'
      );
      setStatus('idle');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Payment failed. Please try again.');
      setStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  }, [stripe, elements, pollIntakeStatus, wait, intakeUuid, practiceName, amount, currency, onSuccess]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">Consultation fee</div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {practiceName} requires payment before confirming your intake.
            </p>
          </div>
          {formattedAmount && (
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{formattedAmount}</div>
          )}
        </div>
        <div className="mt-4">
          <PaymentElement options={{ layout: 'tabs' }} />
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      {status === 'succeeded' ? (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          Payment received. You can return to the conversation for next steps.
        </div>
      ) : null}

      {status === 'processing' && statusDetail ? (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-700 dark:text-blue-200">
          Payment status: {statusDetail}.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            if (onReturn) {
              onReturn();
              return;
            }
            if (typeof window !== 'undefined') {
              window.location.href = returnTo;
            }
          }}
        >
          Return to chat
        </Button>
        {status !== 'succeeded' && (
        <Button
          variant="primary"
          type="submit"
          disabled={isSubmitting || paymentSubmitted || !stripe || !elements}
        >
          {isSubmitting ? 'Processing payment…' : 'Pay now'}
        </Button>
        )}
      </div>
    </form>
  );
};
