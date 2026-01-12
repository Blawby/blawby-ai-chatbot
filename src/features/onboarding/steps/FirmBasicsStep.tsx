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
  disabled?: boolean;
  logoFiles?: File[];
  logoUploading?: boolean;
  logoUploadProgress?: number | null;
  onLogoChange?: (files: FileList | File[]) => void;
}

const sanitizeSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const SLUG_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';

export function FirmBasicsStep({
  data,
  onChange,
  disabled = false,
  logoFiles,
  logoUploading = false,
  logoUploadProgress = null,
  onLogoChange
}: FirmBasicsStepProps) {
  const handleSlugChange = (value: string) => {
    onChange({ ...data, slug: sanitizeSlug(value) });
  };
  const showLogoProgress = logoUploading || logoUploadProgress !== null;

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
        onChange={handleSlugChange}
        disabled={disabled}
        placeholder="your-law-firm"
        pattern={SLUG_PATTERN}
        description="Use lowercase letters, numbers, and hyphens only"
      />

      <FileInput
        label="Upload logo (optional)"
        description="Upload a square logo. Maximum 5 MB."
        accept="image/*"
        multiple={false}
        maxFileSize={5 * 1024 * 1024}
        value={logoFiles ?? []}
        onChange={onLogoChange}
        disabled={disabled || logoUploading}
      />
      {showLogoProgress && (
        <p className="text-xs text-gray-500 mt-2">
          {logoUploading ? 'Uploading logo' : 'Upload progress'}
          {logoUploadProgress !== null ? ` • ${logoUploadProgress}%` : ''}
        </p>
      )}
    </div>
  );
}
