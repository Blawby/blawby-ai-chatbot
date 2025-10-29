/**
 * Trust Account Intro Step Component
 */

import { useTranslation } from '@/i18n/hooks';
import { Button } from '../../ui/Button';

interface TrustAccountIntroStepProps {
  onContinue: () => void;
  onBack: () => void;
}

export function TrustAccountIntroStep({ onContinue, onBack }: TrustAccountIntroStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            Bank-level encryption
          </span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            IOLTA trust compliance
          </span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-green-500 text-lg">✅</span>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            No funds touch Blawby
          </span>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-amber-600 dark:text-amber-400 text-lg">⚖️</span>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Do not use your operating account for this step.
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