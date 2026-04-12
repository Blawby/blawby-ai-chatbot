import { FunctionComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { PAYMENT_CONFIRMED_STORAGE_KEY } from '@/shared/utils/intakePayments';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { SetupShell } from '@/shared/ui/layout/SetupShell';

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
    iconColor: 'text-[rgb(var(--success-foreground))]',
    headline: "You're all set — payment received.",
    body: "Your case details are being reviewed. A member of our team will be in touch at the contact information you provided. You can safely close this tab.",
    badge: 'Payment confirmed',
    badgeClass: 'bg-emerald-500/15 text-[rgb(var(--success-foreground))] border-emerald-500/25',
  },
  pending: {
    Icon: ClockIcon,
    iconColor: 'text-[rgb(var(--warning-foreground))]',
    headline: 'Processing your payment…',
    body: 'This usually takes just a moment. Please keep this tab open. If you have any questions, reach out to your legal team directly.',
    badge: 'Processing',
    badgeClass: 'bg-amber-500/15 text-[rgb(var(--warning-foreground))] border-amber-500/25',
  },
  cancelled: {
    Icon: XCircleIcon,
    iconColor: 'text-[rgb(var(--error-foreground))]',
    headline: 'Payment was not completed.',
    body: 'No charge was made. You can close this tab and try again from your conversation at any time.',
    badge: 'Not completed',
    badgeClass: 'bg-red-500/15 text-[rgb(var(--error-foreground))] border-[rgb(var(--error-foreground))]/25',
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

  const outcome: PaymentOutcome = (isValidSession && isValidUuid) ? 'success' : 'cancelled';

  useEffect(() => {
    if (outcome !== 'success') return;
    
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
  }, [outcome, uuid, sessionId, conversationId, practiceSlug]);

  const config = OUTCOMES[outcome];
  const { Icon } = config;

  const handleClose = () => {
    window.close();
  };


  return (
    <SetupShell>
      <div className="min-h-screen bg-transparent flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
            <Logo />
          </div>
          
          <div className="glass-card p-8 sm:p-10 space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-surface-subtle/50 p-4 border border-line-glass/30 shadow-sm">
                <Icon className={`w-10 h-10 ${config.iconColor}`} aria-hidden="true" />
              </div>
            </div>

            <div className="flex justify-center">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide shadow-sm ${config.badgeClass}`}>
                {config.badge}
              </span>
            </div>

            <div className="text-center space-y-3">
              <h1 className="text-xl font-semibold text-text-primary leading-snug">
                {config.headline}
              </h1>
              <p className="text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
                {config.body}
              </p>
            </div>

            <div className="space-y-3 pt-4">
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

          <p className="mt-8 text-center text-xs text-text-muted">
            Secure payment processed by Stripe &middot; Powered by Blawby
          </p>
        </div>
      </div>
    </SetupShell>
  );
};

export default PaymentResultPage;
