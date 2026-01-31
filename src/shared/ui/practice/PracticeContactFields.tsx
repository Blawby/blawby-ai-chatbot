/**
 * PracticeContactFields - shared contact/address fields for onboarding and settings.
 */

import { EmailInput, Input, PhoneInput, URLInput } from '@/shared/ui/input';

export interface PracticeContactData {
  website?: string;
  businessEmail?: string;
  contactPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface PracticeContactFieldsProps {
  data: PracticeContactData;
  onChange: (data: PracticeContactData) => void;
  disabled?: boolean;
}

export const PracticeContactFields = ({
  data,
  onChange,
  disabled = false
}: PracticeContactFieldsProps) => {
  return (
    <div className="space-y-4">
      <URLInput
        label="Website"
        value={data.website || ''}
        onChange={(value) => onChange({ ...data, website: value })}
        disabled={disabled}
        placeholder="https://yourfirm.com"
      />

      <EmailInput
        label="Business Email"
        value={data.businessEmail || ''}
        onChange={(value) => onChange({ ...data, businessEmail: value })}
        disabled={disabled}
        placeholder="contact@yourfirm.com"
        showValidation
      />

      <PhoneInput
        label="Business Phone"
        value={data.contactPhone || ''}
        onChange={(value) => onChange({ ...data, contactPhone: value })}
        disabled={disabled}
        placeholder="(555) 123-4567"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Address Line 1"
          value={data.addressLine1 || ''}
          onChange={(value) => onChange({ ...data, addressLine1: value })}
          disabled={disabled}
          placeholder="123 Main Street"
        />
        <Input
          label="Address Line 2"
          value={data.addressLine2 || ''}
          onChange={(value) => onChange({ ...data, addressLine2: value })}
          disabled={disabled}
          placeholder="Suite 100"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="City"
          value={data.city || ''}
          onChange={(value) => onChange({ ...data, city: value })}
          disabled={disabled}
          placeholder="San Francisco"
        />
        <Input
          label="State"
          value={data.state || ''}
          onChange={(value) => onChange({ ...data, state: value })}
          disabled={disabled}
          placeholder="CA"
        />
        <Input
          label="Postal Code"
          value={data.postalCode || ''}
          onChange={(value) => onChange({ ...data, postalCode: value })}
          disabled={disabled}
          placeholder="94102"
        />
      </div>

      <Input
        label="Country"
        value={data.country || ''}
        onChange={(value) => onChange({ ...data, country: value })}
        disabled={disabled}
        placeholder="US"
      />
    </div>
  );
};
