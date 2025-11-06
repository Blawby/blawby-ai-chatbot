/**
 * Welcome Step Component
 */

import { FeatureList } from '../molecules/FeatureList';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface WelcomeStepProps {
  onContinue: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

export function WelcomeStep({ onContinue, onBack, onSkip }: WelcomeStepProps) {
  const features = [
    {
      text: 'Configure your business profile and branding',
      variant: 'default' as const
    },
    {
      text: 'Set up services and custom intake questions',
      variant: 'default' as const
    },
    {
      text: 'Launch your AI-powered intake assistant',
      variant: 'default' as const
    }
  ];

  return (
    <div className="space-y-6">
      <FeatureList items={features} size="lg" />
      <OnboardingActions 
        onContinue={onContinue}
        onBack={onBack}
        onSkip={onSkip}
        continueLabel="Get Started"
        isFirstStep={true}
      />
    </div>
  );
}