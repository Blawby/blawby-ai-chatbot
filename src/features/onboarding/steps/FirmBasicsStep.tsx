/**
 * Firm Basics Step Component
 */

import { Input, EmailInput, FileInput } from '@/shared/ui/input';

interface FirmBasicsData {
  firmName: string;
  contactEmail: string;
  slug?: string;
}

interface FirmBasicsStepProps {
  data: FirmBasicsData;
  onChange: (data: FirmBasicsData) => void;
  errors?: string | null;
  disabled?: boolean;
}

export function FirmBasicsStep({ 
  data, 
  onChange, 
  errors: _errors,
  disabled = false
}: FirmBasicsStepProps) {
  return (
    <div className="space-y-6">
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

      <Input
        label="Slug (optional)"
        value={data.slug || ''}
        onChange={(value) => onChange({ ...data, slug: value })}
        disabled={disabled}
        placeholder="your-law-firm"
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
    </div>
  );
}
