/**
 * Trust Account Intro Step Component
 */

import { ChecklistItem } from '../components/ChecklistItem';
import { InfoCard } from '../components/InfoCard';
 
export function TrustAccountIntroStep() {
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
    </div>
  );
}
