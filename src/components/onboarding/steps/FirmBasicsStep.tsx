/**
 * Firm Basics Step Component
 */

import { useState } from 'preact/hooks';
import { Button } from '../../ui/Button';
import { Input, EmailInput, PhoneInput, URLInput, FileInput } from '../../ui/input';

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
}

export function FirmBasicsStep({ 
  data, 
  onChange, 
  onContinue, 
  onBack 
}: FirmBasicsStepProps) {
  const [errors, setErrors] = useState<string[]>([]);

  const handleContinue = () => {
    const validationErrors: string[] = [];
    
    if (!data.firmName.trim()) {
      validationErrors.push('Business name is required');
    }
    if (!data.contactEmail.trim()) {
      validationErrors.push('Business email is required');
    }
    if (!data.contactPhone?.trim()) {
      validationErrors.push('Business phone is required');
    }
    
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    onContinue();
  };

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
            {errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
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

      <div>
        <FileInput
          label="Upload logo (optional)"
          description="Upload a square logo. Maximum 5 MB."
          accept="image/*"
          multiple={false}
          value={[]}
          onChange={() => {}} // Placeholder - no actual upload
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button variant="primary" onClick={handleContinue} className="flex-1">
          Continue
        </Button>
      </div>
    </div>
  );
}