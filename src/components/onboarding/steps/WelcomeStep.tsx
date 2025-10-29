/**
 * Welcome Step Component
 */

import { useTranslation } from '@/i18n/hooks';
import { Button } from '../../ui/Button';

interface WelcomeStepProps {
  onContinue: () => void;
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div className="space-y-6">
      <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
        <li className="flex items-start gap-3">
          <span className="text-accent-500 mt-0.5 leading-none">•</span>
          <span>Configure your business profile and branding</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-accent-500 mt-0.5 leading-none">•</span>
          <span>Set up services and custom intake questions</span>
        </li>
        <li className="flex items-start gap-3">
          <span className="text-accent-500 mt-0.5 leading-none">•</span>
          <span>Launch your AI-powered intake assistant</span>
        </li>
      </ul>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onContinue}
      >
        Get Started
      </Button>
    </div>
  );
}