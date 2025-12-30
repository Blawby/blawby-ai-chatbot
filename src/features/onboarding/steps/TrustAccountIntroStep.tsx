/**
 * Trust Account Intro Step Component
 */

import { ChecklistItem } from '../components/ChecklistItem';
import { InfoCard } from '../components/InfoCard';
import { OnboardingActions } from '../components/OnboardingActions';

interface TrustAccountIntroStepProps {
  onContinue: () => void;
  onBack: () => void;
  onSkip?: () => void;
}

export function TrustAccountIntroStep({ onContinue, onBack, onSkip }: TrustAccountIntroStepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <ChecklistItem status="completed">
          Bank-level encryption
        </ChecklistItem>
        <ChecklistItem status="completed">
          IOLTA trust compliance
        </ChecklistItem>
        <ChecklistItem status="completed">
          No funds touch Blawby
        </ChecklistItem>
      </div>

      <InfoCard
        variant="amber"
        icon="⚖️"
        title="Important Notice"
      >
        Do not use your operating account for this step.
      </InfoCard>

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
        onSkip={onSkip}
      />
    </div>
  );
}