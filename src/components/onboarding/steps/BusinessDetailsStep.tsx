/**
 * Business Details Step Component
 */

import { useTranslation } from '@/i18n/hooks';
import { Button } from '../../ui/Button';
import { Input, Textarea } from '../../ui/input';

interface BusinessDetailsStepProps {
  data: {
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
  };
  onChange: (data: any) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function BusinessDetailsStep({ data, onChange, onContinue, onBack }: BusinessDetailsStepProps) {
  const { t } = useTranslation('onboarding');

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