/**
 * Trust Account Intro Step Component
 */

import { ChecklistItem } from '../components/ChecklistItem';
 
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

    </div>
  );
}
