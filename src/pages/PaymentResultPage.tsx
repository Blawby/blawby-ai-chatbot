import { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { PAYMENT_CONFIRMED_STORAGE_KEY } from '@/shared/utils/intakePayments';
import { Button } from '@/shared/ui/Button';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

type PaymentOutcome = 'success' | 'pending' | 'cancelled' | 'unknown';

interface OutcomeConfig {
  Icon: typeof CheckCircleIcon;
  iconColor: string;
  headline: string;
  body: string;
  badge: string;
  badgeClass: string;
}

const OUTCOMES: Record<PaymentOutcome, OutcomeConfig> = {
  success: {
    Icon: CheckCircleIcon,
    iconColor: 'text-emerald-400',
    headline: "You're all set — payment received.",
    body: "Your case details are being reviewed. A member of our team will be in touch at the contact information you provided. You can safely close this tab.",
    badge: 'Payment confirmed',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  },
  pending: {
    Icon: ClockIcon,
    iconColor: 'text-amber-400',
    headline: 'Processing your payment…',
    body: 'This usually takes just a moment. Please keep this tab open. If you have any questions, reach out to your legal team directly.',
    badge: 'Processing',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  },
  cancelled: {
    Icon: XCircleIcon,
    iconColor: 'text-red-400',
    headline: 'Payment was not completed.',
    body: 'No charge was made. You can close this tab and try again from your conversation at any time.',
    badge: 'Not completed',
    badgeClass: 'bg-red-500/15 text-red-300 border-red-500/25',
  },
  unknown: {
    Icon: ClockIcon,
    iconColor: 'text-slate-400',
    headline: 'Verifying your payment…',
    body: 'Please wait a moment while we confirm your payment status.',
    badge: 'Checking status',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  },
};

const PaymentResultPage: FunctionComponent<{ practiceSlug?: string }> = ({ practiceSlug }) => {
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  const sessionId = params.get('session_id') ?? '';
  const uuid = params.get('uuid') ?? '';
  const conversationId = params.get('conversation_id') ?? '';

  const isValidSession = SESSION_ID_PATTERN.test(sessionId);
  const isValidUuid = UUID_PATTERN.test(uuid);

  const [outcome, setOutcome] = useState<PaymentOutcome>(
    isValidSession ? 'success' : 'unknown'
  );

  useEffect(() => {
    if (!isValidSession || !isValidUuid) {
      setOutcome('cancelled');
      return;
    }

    setOutcome('success');

    // Signal the originating widget tab via localStorage storage event.
    // The widget's usePaymentStatus hook listens for this key on other tabs.
    try {
      const payload = JSON.stringify({
        intakeUuid: uuid,
        sessionId,
        conversationId: conversationId || null,
        practiceSlug: practiceSlug || null,
        ts: Date.now(),
      });
      localStorage.setItem(PAYMENT_CONFIRMED_STORAGE_KEY, payload);
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, [isValidSession, isValidUuid, uuid, sessionId, conversationId, practiceSlug]);

  const config = OUTCOMES[outcome];
  const { Icon } = config;

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      window.close();
    }
  };

  const returnHref = practiceSlug
    ? `/public/${encodeURIComponent(practiceSlug)}`
    : null;

  return (
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center px-4 font-sans">
      {/* Ambient glow */}
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div class="absolute -top-60 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-emerald-500/6 blur-3xl" />
        <div class="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-sky-500/4 blur-3xl" />
      </div>

      <div class="relative w-full max-w-md">
        {/* Blawby wordmark */}
        <p class="text-center text-xs font-semibold tracking-widest text-slate-600 uppercase mb-8">
          Blawby
        </p>

        {/* Card */}
        <div class="rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/60 p-8 sm:p-10">
          <div class="space-y-6">
            {/* Icon */}
            <div class="flex justify-center">
              <div class="rounded-full bg-white/5 border border-white/10 p-4 shadow-inner">
                <Icon class={`w-10 h-10 ${config.iconColor}`} aria-hidden="true" />
              </div>
            </div>

            {/* Status badge */}
            <div class="flex justify-center">
              <span class={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${config.badgeClass}`}>
                {config.badge}
              </span>
            </div>

            {/* Copy */}
            <div class="text-center space-y-3">
              <h1 class="text-xl font-semibold text-white leading-snug">
                {config.headline}
              </h1>
              <p class="text-sm text-slate-400 leading-relaxed">
                {config.body}
              </p>
            </div>

            {/* Actions */}
            <div class="space-y-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleClose}
                className="w-full justify-center"
              >
                Close this tab
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p class="mt-6 text-center text-xs text-slate-700">
          Secure payment processed by Stripe &middot; Powered by Blawby
        </p>
      </div>
    </div>
  );
};

export default PaymentResultPage;
