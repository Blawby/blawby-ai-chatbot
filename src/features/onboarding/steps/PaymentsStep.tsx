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
    <section className="card p-7">
      <h2 className="mb-[18px] font-sans text-[28px] font-normal leading-[1.15] tracking-[-0.01em] text-ink">
        Payments &amp; payouts
      </h2>

      <div className="flex flex-col gap-4 rounded-[var(--r-md)] border border-rule bg-card p-4 sm:flex-row sm:items-center">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded bg-ink font-sans text-lg font-bold text-paper"
          aria-hidden="true"
        >
          S
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="m-0 font-sans text-lg font-normal leading-[1.2] text-ink">
            Set up payouts to get paid
          </h4>
          <p className="mt-1 max-w-[50ch] text-sm text-dim">
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

      <div className="mt-6 rounded-[var(--r-md)] border border-[color-mix(in_oklab,var(--accent)_30%,var(--rule))] bg-[var(--accent-soft)] p-4 text-sm text-ink-2">
        Stripe opens a secure hosted flow for business and representative
        verification. You can return here after Stripe sends you back.
      </div>

      <ul className="mt-6 flex flex-col gap-3 text-sm text-ink-2">
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="mt-0.5 h-4 w-4 text-pos" />
          <span>Connect Stripe to receive payouts for your practice</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="mt-0.5 h-4 w-4 text-pos" />
          <span>Stripe will verify your business and representative details before enabling payouts</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={CheckCircle2} className="mt-0.5 h-4 w-4 text-pos" />
          <span>You can also finish setup later from Payouts &amp; billing settings</span>
        </li>
      </ul>
    </section>
  );
};

export const isPaymentsComplete = (_draft: OnboardingDraft): boolean => true;

export default PaymentsStep;
