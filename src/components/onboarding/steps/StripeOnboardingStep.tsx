/**
 * Stripe Onboarding Step Component
 */

import { InfoCard } from '../atoms/InfoCard';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface StripeOnboardingStepProps {
  onContinue: () => void;
  onBack: () => void;
}

export function StripeOnboardingStep({ onContinue, onBack }: StripeOnboardingStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You'll be redirected to Stripe to complete your account setup and link your trust account.
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

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
      />
    </div>
  );
}