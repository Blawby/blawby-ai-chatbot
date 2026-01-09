/**
 * Business Details Step Component
 */

import { CurrencyInput } from '@/shared/ui/input';
import { PracticeContactFields } from '@/shared/ui/practice/PracticeContactFields';
import { PracticeProfileTextFields } from '@/shared/ui/practice/PracticeProfileTextFields';

interface BusinessDetailsData {
  website?: string;
  contactPhone?: string;
  consultationFee?: number;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  introMessage?: string;
  description: string;
}

interface BusinessDetailsStepProps {
  data: BusinessDetailsData;
  onChange: (data: BusinessDetailsData) => void;
  errors?: string | null;
  disabled?: boolean;
}

export function BusinessDetailsStep({ data, onChange, errors: _errors, disabled = false }: BusinessDetailsStepProps) {
  return (
    <div className="space-y-6">
      <PracticeContactFields
        data={{
          website: data.website,
          contactPhone: data.contactPhone,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          country: data.country
        }}
        onChange={(next) => {
          onChange({ ...data, ...next });
        }}
        disabled={disabled}
      />

      <CurrencyInput
        label="Consultation fee (optional)"
        value={data.consultationFee}
        onChange={(value) => onChange({ ...data, consultationFee: value })}
        disabled={disabled}
        placeholder="150.00"
        step={0.01}
      />

      <PracticeProfileTextFields
        description={data.description}
        introMessage={data.introMessage}
        onDescriptionChange={(value) => onChange({ ...data, description: value })}
        onIntroChange={(value) => onChange({ ...data, introMessage: value })}
        descriptionRows={5}
        introRows={4}
        descriptionLabel="Business description"
        descriptionPlaceholder="Tell us about your business..."
        disabled={disabled}
      />
    </div>
  );
}
