import { forwardRef } from 'preact/compat';
import { Input } from '@/shared/ui/input/Input';
import { Select, type SelectOption } from '@/shared/ui/input/Select';
import { cn } from '@/shared/utils/cn';
import type { Address } from '@/shared/types/address';

export interface AddressFieldsProps {
  value: Partial<Address>;
  onChange: (address: Partial<Address>) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof Address, string>>;
  required?: Partial<Record<keyof Address, boolean>>;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  className?: string;
  showCountry?: boolean;
  countryOptions?: SelectOption[];
}

// Common country options (ISO-2 codes)
const DEFAULT_COUNTRY_OPTIONS: SelectOption[] = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'IT', label: 'Italy' },
  { value: 'ES', label: 'Spain' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'CN', label: 'China' },
  { value: 'IN', label: 'India' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
].sort((a, b) => a.label.localeCompare(b.label));

const STATE_OPTIONS: SelectOption[] = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
].sort((a, b) => a.label.localeCompare(b.label));

export const AddressFields = forwardRef<HTMLDivElement, AddressFieldsProps>(({
  value,
  onChange,
  disabled = false,
  errors = {},
  required = {},
  size = 'md',
  variant = 'default',
  className = '',
  showCountry = true,
  countryOptions = DEFAULT_COUNTRY_OPTIONS,
}, ref) => {
  const updateField = (field: keyof Address, fieldValue: string) => {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  };

  const hasError = (field: keyof Address) => !!errors[field];
  const getError = (field: keyof Address) => errors[field];
  const isRequired = (field: keyof Address) => !!required[field];

  const containerClasses = cn(
    'space-y-4',
    className
  );

  const inputClasses = cn(
    hasError('line1') && 'border-red-300 dark:border-red-600',
    hasError('line2') && 'border-red-300 dark:border-red-600',
    hasError('city') && 'border-red-300 dark:border-red-600',
    hasError('state') && 'border-red-300 dark:border-red-600',
    hasError('postalCode') && 'border-red-300 dark:border-red-600',
    hasError('country') && 'border-red-300 dark:border-red-600'
  );

  return (
    <div ref={ref} className={containerClasses}>
      {/* Address Line 1 */}
      <Input
        label="Street Address"
        value={value.line1 || ''}
        onChange={(newValue) => updateField('line1', newValue)}
        disabled={disabled}
        placeholder="123 Main Street"
        required={isRequired('line1')}
        error={getError('line1')}
        variant={hasError('line1') ? 'error' : variant}
        size={size}
        className={inputClasses}
      />

      {/* Address Line 2 */}
      <Input
        label="Apartment, suite, etc. (optional)"
        value={value.line2 || ''}
        onChange={(newValue) => updateField('line2', newValue)}
        disabled={disabled}
        placeholder="Apt 4B"
        required={false}
        error={getError('line2')}
        variant={hasError('line2') ? 'error' : variant}
        size={size}
        className={inputClasses}
      />

      {/* City, State, Postal Code */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* City */}
        <div className="sm:col-span-1 lg:col-span-1">
          <Input
            label="City"
            value={value.city || ''}
            onChange={(newValue) => updateField('city', newValue)}
            disabled={disabled}
            placeholder="San Francisco"
            required={isRequired('city')}
            error={getError('city')}
            variant={hasError('city') ? 'error' : variant}
            size={size}
            className={inputClasses}
          />
        </div>

        {/* State */}
        <div className="sm:col-span-1 lg:col-span-1">
          <div className="relative">
            {value.country === 'US' ? (
              <Select
                label={isRequired('state') ? 'State *' : 'State'}
                value={value.state || ''}
                onChange={(newValue) => updateField('state', newValue)}
                disabled={disabled}
                placeholder="Select state"
                options={STATE_OPTIONS}
                className={cn(
                  inputClasses,
                  hasError('state') && 'border-red-300 dark:border-red-600'
                )}
              />
            ) : (
              <Input
                label={isRequired('state') ? 'State/Province *' : 'State/Province'}
                value={value.state || ''}
                onChange={(newValue) => updateField('state', newValue)}
                disabled={disabled}
                placeholder="State/Province"
                required={isRequired('state')}
                error={getError('state')}
                variant={hasError('state') ? 'error' : variant}
                size={size}
                className={inputClasses}
              />
            )}
            {hasError('state') && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {getError('state')}
              </p>
            )}
          </div>
        </div>

        {/* Postal Code */}
        <div className="sm:col-span-1 lg:col-span-1">
          <Input
            label="Postal Code"
            value={value.postalCode || ''}
            onChange={(newValue) => updateField('postalCode', newValue)}
            disabled={disabled}
            placeholder={value.country === 'US' ? '94102' : 'Postal code'}
            required={isRequired('postalCode')}
            error={getError('postalCode')}
            variant={hasError('postalCode') ? 'error' : variant}
            size={size}
            className={inputClasses}
          />
        </div>

        {/* Country */}
        {showCountry && (
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="relative">
              <Select
                label={isRequired('country') ? 'Country *' : 'Country'}
                value={value.country || 'US'}
                onChange={(newValue) => updateField('country', newValue)}
                disabled={disabled}
                placeholder="Select country"
                options={countryOptions}
                className={cn(
                  inputClasses,
                  hasError('country') && 'border-red-300 dark:border-red-600'
                )}
              />
              {hasError('country') && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {getError('country')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error Summary */}
      {Object.values(errors).some(Boolean) && (
        <div className="text-sm text-red-600 dark:text-red-400">
          Please correct the errors above.
        </div>
      )}
    </div>
  );
});

AddressFields.displayName = 'AddressFields';
