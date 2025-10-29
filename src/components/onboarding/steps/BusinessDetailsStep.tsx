/**
 * Business Details Step Component
 */

import { Input, Textarea } from '../../ui/input';
import { OnboardingActions } from '../molecules/OnboardingActions';

interface BusinessDetailsData {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  primaryColor: string;
  accentColor: string;
  introMessage: string;
  overview: string;
}

interface BusinessDetailsStepProps {
  data: BusinessDetailsData;
  onChange: (data: BusinessDetailsData) => void;
  onContinue: () => void;
  onBack: () => void;
  errors?: string | null;
}

export function BusinessDetailsStep({ data, onChange, onContinue, onBack, errors }: BusinessDetailsStepProps) {
  return (
    <div className="space-y-6">
      {/* Address fields - Row 1: Address Line 1 & 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Address line 1"
          value={data.addressLine1 || ''}
          onChange={(value) => onChange({ ...data, addressLine1: value })}
          placeholder="123 Main Street"
        />
        <Input
          label="Address line 2 (optional)"
          value={data.addressLine2 || ''}
          onChange={(value) => onChange({ ...data, addressLine2: value })}
          placeholder="Suite 100, Floor 2"
        />
      </div>

      {/* Address fields - Row 2: City, State, Postal Code */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="City"
          value={data.city || ''}
          onChange={(value) => onChange({ ...data, city: value })}
          placeholder="New York"
        />
        <Input
          label="State/Province"
          value={data.state || ''}
          onChange={(value) => onChange({ ...data, state: value })}
          placeholder="NY"
        />
        <Input
          label="Postal Code"
          value={data.postalCode || ''}
          onChange={(value) => onChange({ ...data, postalCode: value })}
          placeholder="10001"
        />
      </div>

      {/* Address fields - Row 3: Country */}
      <Input
        label="Country"
        value={data.country || ''}
        onChange={(value) => onChange({ ...data, country: value })}
        placeholder="United States"
      />

      {/* Business Description */}
      <Textarea
        label="Business description"
        value={data.overview}
        onChange={(value) => onChange({ ...data, overview: value })}
        rows={5}
      />

      <OnboardingActions
        onContinue={onContinue}
        onBack={onBack}
      />
    </div>
  );
}