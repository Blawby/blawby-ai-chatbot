/**
 * Stripe Onboarding Step Component
 */

import { InfoCard } from '../atoms/InfoCard';
import { OnboardingActions } from '../molecules/OnboardingActions';
import type { StripeConnectStatus } from '../types';

interface StripeOnboardingStepProps {
  onContinue: () => void;
  onBack: () => void;
  onSkip?: () => void;
  status?: StripeConnectStatus | null;
  loading?: boolean;
  clientSecret?: string | null;
}

export function StripeOnboardingStep({
  onContinue,
  onBack,
  onSkip,
  status,
  loading = false,
  clientSecret
}: StripeOnboardingStepProps) {
  const statusItems = [
    {
      label: 'Stripe account',
      value: status?.stripe_account_id ? 'Provisioned' : 'Not created yet'
    },
    {
      label: 'Charges',
      value: status?.charges_enabled ? 'Enabled' : 'Pending verification'
    },
    {
      label: 'Payouts',
      value: status?.payouts_enabled ? 'Enabled' : 'Pending verification'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You&apos;ll be redirected to Stripe to complete your account setup and link your trust account.
        </p>
      </div>
      
      <InfoCard
        variant="blue"
        icon="💳"
        title="Connect with Stripe"
      >
        <p className="text-center text-sm">
          Secure payment processing for your legal practice
        </p>
      </InfoCard>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2 bg-white dark:bg-gray-900/40">
        {statusItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {item.value}
            </span>
          </div>
        ))}
        {clientSecret && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-2">
            A secure Stripe onboarding session is ready. Complete the embedded form to finish verification.
          </p>
        )}
      </div>

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
        onSkip={onSkip}
        loading={loading}
      />
    </div>
  );
}
