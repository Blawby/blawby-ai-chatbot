import type { FunctionComponent } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/compat';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { Button } from '@/shared/ui/Button';
import { getConversationWsEndpoint, getIntakeConfirmEndpoint } from '@/config/api';
import { isPaidIntakeStatus } from '@/shared/utils/intakePayments';
import { useNavigation } from '@/shared/utils/navigation';
import { toMajorUnits } from '@/shared/utils/moneyNormalization';

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
    return formatCurrency(toMajorUnits(amount) ?? 0, normalizedCurrency, resolvedLocale);
  } catch (error) {
    console.warn('[IntakePayment] Failed to format currency', error);
    try {
      return formatCurrency(toMajorUnits(amount) ?? 0, 'USD', 'en');
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
  const { navigate } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'succeeded' | 'failed'>('idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const isMountedRef = useRef(true);
  const paymentWaitControllerRef = useRef<AbortController | null>(null);

  const TERMINAL_FAILURE_STATUSES = useMemo(
    () => new Set(['failed', 'canceled', 'cancelled', 'expired']),
    []
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      paymentWaitControllerRef.current?.abort();
      paymentWaitControllerRef.current = null;
    };
  }, []);

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const formattedAmount = useMemo(
    () => formatIntakeAmount(amount, currency, locale),
    [amount, currency, locale]
  );

  const confirmIntakeLead = useCallback(async (): Promise<boolean> => {
    if (!intakeUuid || !practiceId || !conversationId) {
      return false;
    }
    try {
      const response = await fetch(`${getIntakeConfirmEndpoint()}?practiceId=${encodeURIComponent(practiceId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
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
        return false;
      }
      return true;
    } catch (error) {
      console.warn('[IntakePayment] Intake confirmation failed', error);
      return false;
    }
  }, [conversationId, intakeUuid, practiceId]);

  const waitForPaymentConfirmation = useCallback(async (timeoutMs = 20000, signal?: AbortSignal): Promise<string | null> => {
    if (!conversationId || !intakeUuid) {
      return null;
    }

    const wsUrl = getConversationWsEndpoint(conversationId);

    if (signal?.aborted) {
      return null;
    }

    return await new Promise<string | null>((resolve) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const onAbort = () => {
        cleanup();
        resolve(null);
      };

      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        signal?.removeEventListener('abort', onAbort);
        try {
          ws.close();
        } catch {
          // ignore
        }
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      timeoutId = setTimeout(() => {
        console.warn('[IntakePayment] Timed out waiting for payment confirmation');
        cleanup();
        resolve(null);
      }, timeoutMs);

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'auth',
          data: {
            protocol_version: 1,
            client_info: { platform: 'web' }
          }
        }));
      });

      ws.addEventListener('message', (event) => {
        if (settled) return;
        if (typeof event.data !== 'string') return;
        let frame: { type?: string; data?: Record<string, unknown> };
        try {
          frame = JSON.parse(event.data) as { type?: string; data?: Record<string, unknown> };
        } catch {
          return;
        }

        if (frame.type === 'auth.error' || frame.type === 'error') {
          console.warn('[IntakePayment] WebSocket auth error', frame.data);
          cleanup();
          resolve(null);
          return;
        }

        if (frame.type !== 'message.new' || !frame.data) {
          return;
        }

        const metadata = typeof frame.data.metadata === 'object' && frame.data.metadata !== null
          ? frame.data.metadata as Record<string, unknown>
          : null;
        const messageIntakeUuid = typeof metadata?.intakeUuid === 'string'
          ? metadata.intakeUuid
          : typeof metadata?.intakePaymentUuid === 'string'
            ? metadata.intakePaymentUuid
            : null;
        if (!messageIntakeUuid || messageIntakeUuid !== intakeUuid) {
          return;
        }
        const paymentStatus = typeof metadata?.paymentStatus === 'string'
          ? metadata.paymentStatus
          : typeof metadata?.payment_status === 'string'
            ? metadata.payment_status
            : null;
        if (!paymentStatus || !isPaidIntakeStatus(paymentStatus)) {
          return;
        }
        cleanup();
        resolve(paymentStatus);
      });

      ws.addEventListener('error', () => {
        if (settled) return;
        cleanup();
        resolve(null);
      });

      ws.addEventListener('close', () => {
        if (settled) return;
        cleanup();
        resolve(null);
      });
    });
  }, [conversationId, intakeUuid]);

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

      const paymentIntentStatus = result.paymentIntent?.status ?? null;
      if (paymentIntentStatus) {
        setStatusDetail(paymentIntentStatus);
      }

      if (paymentIntentStatus === 'requires_action') {
        setPaymentSubmitted(false);
        setStatus('failed');
        setErrorMessage('Payment requires additional authentication. Please complete the verification and try again.');
        return;
      }

      if (paymentIntentStatus === 'requires_payment_method') {
        setPaymentSubmitted(false);
        setStatus('failed');
        setErrorMessage('Payment failed. Please try another payment method.');
        return;
      }

      if (paymentIntentStatus && TERMINAL_FAILURE_STATUSES.has(paymentIntentStatus)) {
        setPaymentSubmitted(false);
        setStatus('failed');
        setErrorMessage(`Payment ${paymentIntentStatus}. Please try again or contact support.`);
        return;
      }

      if (paymentIntentStatus === 'succeeded' || paymentIntentStatus === 'processing') {
        const confirmed = await confirmIntakeLead();
        if (!isMountedRef.current) return;
        if (confirmed) {
          setStatus('succeeded');
          onSuccess?.();
          return;
        }
        console.warn('[IntakePayment] Intake confirmation did not succeed after payment intent result', {
          intakeUuid,
          paymentIntentStatus
        });
      }

      const waitController = new AbortController();
      paymentWaitControllerRef.current?.abort();
      paymentWaitControllerRef.current = waitController;
      const wsStatus = await waitForPaymentConfirmation(20000, waitController.signal);
      if (paymentWaitControllerRef.current === waitController) {
        paymentWaitControllerRef.current = null;
      }
      if (!isMountedRef.current) return;
      if (wsStatus && isPaidIntakeStatus(wsStatus)) {
        const confirmed = await confirmIntakeLead();
        if (!isMountedRef.current) return;
        if (!confirmed) {
          const retryConfirmed = await confirmIntakeLead();
          if (!isMountedRef.current) return;
          if (!retryConfirmed) {
            setPaymentSubmitted(false);
            setStatus('failed');
            setStatusDetail(wsStatus);
            setErrorMessage(
              'Payment was received, but we could not confirm your intake. Please refresh or contact support.'
            );
            return;
          }
        }
        setStatus('succeeded');
        setStatusDetail(wsStatus);
        onSuccess?.();
        return;
      }

      setPaymentSubmitted(false);
      setStatus('idle');
      setErrorMessage(
        'Payment is still processing. Return to the chat and check status again in a moment.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Payment failed. Please try again.');
      setStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    stripe,
    elements,
    intakeUuid,
    confirmIntakeLead,
    onSuccess,
    TERMINAL_FAILURE_STATUSES,
    waitForPaymentConfirmation
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
                navigate(candidate, true);
                return;
              }
              try {
                const url = new URL(candidate, window.location.origin);
                if (url.origin === window.location.origin) {
                  navigate(url.pathname + url.search + url.hash, true);
                  return;
                }
                window.location.href = url.toString();
                return;
              } catch {
                // Fall through to default.
              }
              navigate('/', true);
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
