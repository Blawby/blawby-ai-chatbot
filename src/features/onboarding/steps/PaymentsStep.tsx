import { useState } from 'preact/hooks';
import { CheckCircle2 } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { createConnectedAccount } from '@/shared/lib/apiClient';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';
import type { OnboardingDraft } from '../types';

interface PaymentsStepProps {
  draft: OnboardingDraft;
  practiceEmail: string;
  redirectToStripe?: (url: string) => void;
}

const defaultRedirectToStripe = (url: string): void => {
  if (typeof window === 'undefined') return;
  window.location.href = url;
};

export const PaymentsStep = ({
  draft,
  practiceEmail,
  redirectToStripe = defaultRedirectToStripe,
}: PaymentsStepProps) => {
  const { showError } = useToastContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const organizationId = draft.createdOrganizationId ?? null;

  const handleStartStripe = async () => {
    if (!organizationId) {
      showError('Payouts', 'Missing practice context.');
      return;
    }
    if (!practiceEmail) {
      showError('Payouts', 'Add an email before starting Stripe verification.');
      return;
    }
    if (typeof window === 'undefined') {
      showError('Payouts', 'Unable to start Stripe onboarding in this environment.');
      return;
    }

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const returnUrl = new URL(baseUrl);
    returnUrl.searchParams.set('stripe', 'return');
    const refreshUrl = new URL(baseUrl);
    refreshUrl.searchParams.set('stripe', 'refresh');

    setIsSubmitting(true);
    try {
      const connectedAccount = await createConnectedAccount({
        practiceEmail,
        practiceUuid: organizationId,
        returnUrl: returnUrl.toString(),
        refreshUrl: refreshUrl.toString(),
      });
      const validatedUrl = getValidatedStripeOnboardingUrl(connectedAccount.onboardingUrl);
      if (!validatedUrl) {
        showError('Payouts', 'Stripe onboarding link was not provided. Please try again.');
        return;
      }
      redirectToStripe(validatedUrl);
    } catch (error) {
      showError('Payouts', error instanceof Error ? error.message : 'Failed to start Stripe onboarding');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card" style={{ padding: '28px' }}>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 400,
          fontSize: '28px',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          margin: '0 0 18px',
          color: 'var(--ink)'
        }}
      >
        Payments &amp; payouts
      </h2>

      <div
        className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--rule)',
          borderRadius: 'var(--r-md)'
        }}
      >
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded"
          style={{
            background: 'var(--ink)',
            color: 'var(--paper)',
            fontWeight: 700,
            fontFamily: 'var(--sans)',
            fontSize: '18px'
          }}
          aria-hidden="true"
        >
          S
        </div>
        <div className="min-w-0 flex-1">
          <h4
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 400,
              fontSize: '18px',
              margin: 0,
              lineHeight: 1.2,
              color: 'var(--ink)'
            }}
          >
            Set up payouts to get paid
          </h4>
          <p className="mt-1 text-sm" style={{ color: 'var(--dim)', maxWidth: '50ch' }}>
            Connect your bank account with Stripe so you can accept payments and
            receive payouts.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleStartStripe()}
          disabled={isSubmitting || !organizationId || !practiceEmail}
        >
          {isSubmitting ? 'Preparing Stripe...' : 'Start Stripe setup'}
        </Button>
      </div>

      <div
        className="mt-6 rounded-md border p-4 text-sm"
        style={{
          background: 'var(--accent-soft)',
          borderColor: 'color-mix(in oklab, var(--accent) 30%, var(--rule))',
          borderRadius: 'var(--r-md)',
          color: 'var(--ink-2)'
        }}
      >
        Stripe opens a secure hosted flow for business and representative
        verification. You can return here after Stripe sends you back.
      </div>

      <ul className="mt-6 flex flex-col gap-3 text-sm" style={{ color: 'var(--ink-2)' }}>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="h-4 w-4 mt-0.5" style={{ color: 'var(--pos)' }} />
          <span>Connect Stripe to receive payouts for your practice</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="h-4 w-4 mt-0.5" style={{ color: 'var(--pos)' }} />
          <span>Stripe will verify your business and representative details before enabling payouts</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="h-4 w-4 mt-0.5" style={{ color: 'var(--pos)' }} />
          <span>You can also finish setup later from Payouts &amp; billing settings</span>
        </li>
      </ul>
    </section>
  );
};

export const isPaymentsComplete = (_draft: OnboardingDraft): boolean => true;

export default PaymentsStep;
