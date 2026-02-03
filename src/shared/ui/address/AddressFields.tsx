import { forwardRef } from 'preact/compat';
import { Input } from '@/shared/ui/input/Input';
import { Select, type SelectOption } from '@/shared/ui/input/Select';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';
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
  label?: string;
  placeholder?: string;
  streetAddressProps?: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    isLoading: boolean;
    isOpen: boolean;
    disabled?: boolean;
    suggestions: Array<{
      id: string;
      label: string;
      formatted: string;
    }>;
    selectedIndex: number;
    onSuggestionSelect: (suggestion: { id: string; label: string; formatted: string }) => void;
    limit?: number;
  };
}

// Common country options (ISO-2 codes)
export const DEFAULT_COUNTRY_OPTIONS: SelectOption[] = [
  { value: 'US', label: 'USA' },
  { value: 'CA', label: 'CAN' },
  { value: 'GB', label: 'GBR' },
  { value: 'AU', label: 'AUS' },
  { value: 'DE', label: 'DEU' },
  { value: 'FR', label: 'FRA' },
  { value: 'IT', label: 'ITA' },
  { value: 'ES', label: 'ESP' },
  { value: 'JP', label: 'JPN' },
  { value: 'KR', label: 'KOR' },
  { value: 'CN', label: 'CHN' },
  { value: 'IN', label: 'IND' },
  { value: 'BR', label: 'BRA' },
  { value: 'MX', label: 'MEX' },
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
  { value: 'DC', label: 'District of Columbia' },
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
  label,
  placeholder,
  streetAddressProps,
}, ref) => {
  // Default address value to prevent null issues
  const safeValue = value || { address: '', apartment: '', city: '', state: '', postalCode: '', country: '' };
  
  // Generate unique IDs for this component instance
  const listboxId = useUniqueId('address-suggestions-listbox');
  const updateField = (field: keyof Address, fieldValue: string) => {
    onChange({
      ...safeValue,
      [field]: fieldValue,
    });
  };

  const hasError = (field: keyof Address) => !!errors[field];
  const getError = (field: keyof Address) => errors[field];
  const isRequired = (field: keyof Address) => !!required[field];

  const getInputClasses = (field: keyof Address) => cn(
    hasError(field) && 'border-red-300 dark:border-red-600'
  );

  const containerClasses = cn(
    'space-y-4',
    className
  );


  return (
    <div ref={ref} className={containerClasses}>
      {/* Address Line 1 */}
      <div className="relative">
        <Input
          label={label}
          placeholder={placeholder}
          value={streetAddressProps?.value ?? safeValue.address ?? ''}
          onChange={(newValue) => {
            if (streetAddressProps?.onChange) {
              streetAddressProps.onChange(newValue);
            } else {
              updateField('address', newValue);
            }
          }}
          disabled={disabled}
          required={isRequired('address')}
          error={getError('address')}
          variant={hasError('address') ? 'error' : variant}
          size={size}
          className={cn(
            getInputClasses('address'),
            streetAddressProps?.isOpen && 'ring-2 ring-blue-500 border-blue-500'
          )}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={streetAddressProps?.isOpen || false}
          aria-controls={streetAddressProps?.isOpen ? listboxId : undefined}
          aria-activedescendant={
            streetAddressProps?.selectedIndex >= 0 && streetAddressProps?.suggestions[streetAddressProps.selectedIndex]
              ? `address-suggestion-${streetAddressProps.suggestions[streetAddressProps.selectedIndex].id}`
              : undefined
          }
          onKeyDown={streetAddressProps?.onKeyDown}
        />
        
        {/* Loading indicator */}
        {streetAddressProps?.isLoading && (
          <div className="absolute top-1/2 right-3 transform -translate-y-1/2 pointer-events-none">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600" />
          </div>
        )}

        {/* Autocomplete dropdown */}
        {streetAddressProps?.isOpen && !streetAddressProps?.disabled && (
          <div 
            role="listbox"
            id={listboxId}
            aria-label="Address suggestions"
            data-testid="autocomplete-dropdown"
            className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-card-bg border border-gray-200 dark:border-dark-border rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {streetAddressProps.suggestions.length > 0 ? (
              <ul className="py-1">
                {streetAddressProps.suggestions.map((suggestion, index) => (
                  <li
                    key={suggestion.id}
                  >
                    <button
                      type="button"
                      role="option"
                      id={`address-suggestion-${suggestion.id}`}
                      aria-selected={index === streetAddressProps.selectedIndex}
                      className={cn(
                        'w-full text-left px-3 py-2 cursor-pointer transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-700',
                        index === streetAddressProps.selectedIndex && 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                      )}
                      onClick={() => streetAddressProps.onSuggestionSelect(suggestion)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          streetAddressProps.onSuggestionSelect(suggestion);
                        }
                      }}
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {suggestion.formatted}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No suggestions found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Address Line 2 */}
      <Input
        label=""
        value={safeValue.apartment ?? ''}
        onChange={(newValue) => updateField('apartment', newValue)}
        disabled={disabled}
        placeholder="Apartment, suite, etc. (optional)"
        required={false}
        error={getError('apartment')}
        variant={hasError('apartment') ? 'error' : variant}
        size={size}
        className={getInputClasses('apartment')}
      />

      {/* City, State, Postal Code - 3 Column Layout */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* City */}
        <div>
          <Input
            label=""
            value={safeValue.city ?? ''}
            onChange={(newValue) => updateField('city', newValue)}
            disabled={disabled}
            placeholder="City"
            required={isRequired('city')}
            error={getError('city')}
            variant={hasError('city') ? 'error' : variant}
            size={size}
            className={getInputClasses('city')}
          />
        </div>

        {/* State */}
        <div>
          <div className="relative">
            {safeValue.country === 'US' ? (
              <>
                <Select
                  label=""
                  value={safeValue.state ?? ''}
                  onChange={(newValue) => updateField('state', newValue)}
                  disabled={disabled}
                  placeholder="State"
                  options={STATE_OPTIONS}
                  className={cn(
                    getInputClasses('state'),
                    hasError('state') && 'border-red-300 dark:border-red-600'
                  )}
                />
                {hasError('state') && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {getError('state')}
                  </p>
                )}
              </>
            ) : (
              <Input
                label=""
                value={safeValue.state ?? ''}
                onChange={(newValue) => updateField('state', newValue)}
                disabled={disabled}
                placeholder="State/Province"
                required={isRequired('state')}
                error={getError('state')}
                variant={hasError('state') ? 'error' : variant}
                size={size}
                className={getInputClasses('state')}
              />
            )}
          </div>
        </div>

        {/* Postal Code */}
        <div>
          <Input
            label=""
            value={safeValue.postalCode ?? ''}
            onChange={(newValue) => updateField('postalCode', newValue)}
            disabled={disabled}
            placeholder={safeValue?.country === 'US' ? 'ZIP code' : 'Postal code'}
            required={isRequired('postalCode')}
            error={getError('postalCode')}
            variant={hasError('postalCode') ? 'error' : variant}
            size={size}
            className={getInputClasses('postalCode')}
          />
        </div>

        {/* Country */}
        {showCountry && (
          <div>
            <Select
              label=""
              value={safeValue.country ?? ''}
              onChange={(newValue) => updateField('country', newValue)}
              disabled={disabled}
              options={countryOptions}
              className={getInputClasses('country')}
              placeholder="Country"
            />
            {hasError('country') && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {getError('country')}
              </p>
            )}
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
