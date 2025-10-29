/**
 * Stripe Onboarding Step Component
 */

import { useTranslation } from '@/i18n/hooks';
import { Button } from '../../ui/Button';

interface StripeOnboardingStepProps {
  onContinue: () => void;
  onBack: () => void;
}

export function StripeOnboardingStep({ onContinue, onBack }: StripeOnboardingStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You'll be redirected to Stripe to complete your account setup.
        </p>
      </div>
      
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xl">💳</span>
          </div>
          <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
            Connect with Stripe
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Secure payment processing for your legal practice
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button variant="primary" onClick={onContinue} className="flex-1">
          Continue
        </Button>
      </div>
    </div>
  );
}