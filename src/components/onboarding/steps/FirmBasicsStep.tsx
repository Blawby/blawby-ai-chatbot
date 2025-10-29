/**
 * Firm Basics Step Component
 */

import { Input, EmailInput, PhoneInput, URLInput, FileInput } from '../../ui/input';
import { ValidationAlert } from '../atoms/ValidationAlert';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface FirmBasicsData {
  firmName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
}

interface FirmBasicsStepProps {
  data: FirmBasicsData;
  onChange: (data: FirmBasicsData) => void;
  onContinue: () => void;
  onBack: () => void;
  errors?: string | null;
}

export function FirmBasicsStep({ 
  data, 
  onChange, 
  onContinue, 
  onBack,
  errors
}: FirmBasicsStepProps) {
  return (
    <div className="space-y-6">
      {errors && (
        <ValidationAlert type="error">
          {errors}
        </ValidationAlert>
      )}

      <Input
        label="Business name"
        value={data.firmName}
        onChange={(value) => onChange({ ...data, firmName: value })}
        required
      />

      <EmailInput
        label="Business email"
        value={data.contactEmail}
        onChange={(value) => onChange({ ...data, contactEmail: value })}
        required
        showValidation
      />

      <PhoneInput
        label="Business phone"
        value={data.contactPhone || ''}
        onChange={(value) => onChange({ ...data, contactPhone: value })}
        required
      />

      <URLInput
        label="Website (optional)"
        value={data.website || ''}
        onChange={(value) => onChange({ ...data, website: value })}
        placeholder="https://yourbusiness.com"
      />

      <FileInput
        label="Upload logo (optional)"
        description="Upload a square logo. Maximum 5 MB."
        accept="image/*"
        multiple={false}
        value={[]}
        onChange={() => {}} // Placeholder - no actual upload
      />

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
      />
    </div>
  );
}