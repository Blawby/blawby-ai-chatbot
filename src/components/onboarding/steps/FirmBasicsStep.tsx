/**
 * Firm Basics Step Component
 */

import { Input, EmailInput, PhoneInput, URLInput, FileInput } from '../../ui/input';
import { ValidationAlert } from '../atoms/ValidationAlert';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface FirmBasicsData {
  firmName: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
}

interface FirmBasicsStepProps {
  data: FirmBasicsData;
  onChange: (data: FirmBasicsData) => void;
  onContinue: () => void;
  onBack: () => void;
  errors?: string | null;
  disabled?: boolean;
  onSkip?: () => void;
}

export function FirmBasicsStep({ 
  data, 
  onChange, 
  onContinue, 
  onBack,
  errors,
  disabled = false,
  onSkip
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
        disabled={disabled}
        required
      />

      <EmailInput
        label="Business email"
        value={data.contactEmail}
        onChange={(value) => onChange({ ...data, contactEmail: value })}
        disabled={disabled}
        required
        showValidation
      />

      <PhoneInput
        label="Business phone (optional)"
        value={data.contactPhone || ''}
        onChange={(value) => onChange({ ...data, contactPhone: value })}
        disabled={disabled}
      />

      <URLInput
        label="Website (optional)"
        value={data.website || ''}
        onChange={(value) => onChange({ ...data, website: value })}
        disabled={disabled}
        placeholder="https://yourbusiness.com"
      />

      <FileInput
        label="Upload logo (optional)"
        description="Upload a square logo. Maximum 5 MB."
        accept="image/*"
        multiple={false}
        maxFileSize={5 * 1024 * 1024}
        value={[]}
        onChange={() => {}} // Placeholder - no actual upload
        disabled={disabled}
      />

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
        loading={disabled}
        onSkip={onSkip}
      />
    </div>
  );
}