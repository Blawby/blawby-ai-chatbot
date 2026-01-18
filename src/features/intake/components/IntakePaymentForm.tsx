import type { FunctionComponent } from 'preact/compat';
import { useCallback, useMemo, useState } from 'preact/compat';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { Button } from '@/shared/ui/Button';
import { getIntakeConfirmEndpoint } from '@/config/api';
import { fetchIntakePaymentStatus, isPaidIntakeStatus } from '@/shared/utils/intakePayments';
import { getTokenAsync } from '@/shared/lib/tokenStorage';

interface IntakePaymentFormProps {
  practiceName: string;
  amount?: number;
  currency?: string;
  intakeUuid?: string;
  practiceId?: string;
  conversationId?: string;
  returnTo: string;
  onSuccess?: () => void;
  onReturn?: () => void;
}

const formatIntakeAmount = (amount?: number, currency?: string, locale?: string) => {
  if (typeof amount !== 'number') return null;
  const rawCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  const normalizedCurrency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'USD';
  const resolvedLocale = locale || 'en';
  try {
    return formatCurrency(amount / 100, normalizedCurrency, resolvedLocale);
  } catch (error) {
    console.warn('[IntakePayment] Failed to format currency', error);
    try {
      return formatCurrency(amount / 100, 'USD', 'en');
    } catch {
      return null;
    }
  }
};

export const IntakePaymentForm: FunctionComponent<IntakePaymentFormProps> = ({
  practiceName,
  amount,
  currency,
  intakeUuid,
  practiceId,
  conversationId,
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

  const pollIntakeStatus = useCallback(() => fetchIntakePaymentStatus(intakeUuid), [intakeUuid]);

  const confirmIntakeLead = useCallback(async () => {
    if (!intakeUuid || !practiceId || !conversationId) {
      return;
    }
    try {
      const token = await getTokenAsync();
      if (!token) {
        console.warn('[IntakePayment] Missing auth token for intake confirmation');
        return;
      }
      const response = await fetch(`${getIntakeConfirmEndpoint()}?practiceId=${encodeURIComponent(practiceId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          intakeUuid,
          conversationId
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        const detail = payload?.error ? ` (${payload.error})` : '';
        console.warn(`[IntakePayment] Intake confirmation failed: ${response.status}${detail}`);
      }
    } catch (error) {
      console.warn('[IntakePayment] Intake confirmation failed', error);
    }
  }, [conversationId, intakeUuid, practiceId]);

  const handleSubmit = useCallback(async (event: SubmitEvent) => {
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

      if (result.paymentIntent) {
        setPaymentSubmitted(true);
        setStatus('processing');
      }

      const latestStatus = await pollIntakeStatus();
      if (latestStatus) {
        setStatusDetail(latestStatus);
      }

      if (isPaidIntakeStatus(latestStatus)) {
        setStatus('succeeded');
        await confirmIntakeLead();
        if (typeof window !== 'undefined' && intakeUuid) {
          try {
            const payload = {
              practiceName,
              amount,
              currency,
              practiceId,
              conversationId
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

      setPaymentSubmitted(false);
      setErrorMessage(
        'Payment is still processing. Return to the chat and check status again in a moment.'
      );
      setStatus('idle');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Payment failed. Please try again.');
      setStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    stripe,
    elements,
    pollIntakeStatus,
    intakeUuid,
    practiceName,
    amount,
    currency,
    practiceId,
    conversationId,
    confirmIntakeLead,
    onSuccess
  ]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {(!stripe || !elements) && (
        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card-bg px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          Loading secure payment form…
        </div>
      )}
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
              const candidate = returnTo || '/';
              const safe =
                candidate.startsWith('/') &&
                !candidate.startsWith('//') &&
                !candidate.includes('://');
              if (safe) {
                window.location.href = candidate;
                return;
              }
              try {
                const url = new URL(candidate, window.location.origin);
                if (url.origin === window.location.origin) {
                  window.location.href = url.pathname + url.search + url.hash;
                  return;
                }
              } catch {
                // Fall through to default.
              }
              window.location.href = '/';
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
