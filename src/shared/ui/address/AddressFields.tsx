import { forwardRef } from 'preact/compat';
import { Input } from '@/shared/ui/input/Input';
import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';
import type { Address } from '@/shared/types/address';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddressSuggestion {
  id: string;
  label: string;
  formatted: string;
}

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
  countryOptions?: ComboboxOption[];
  label?: string;
  placeholder?: string;
  /** Props for street address autocomplete behaviour */
  streetAddressProps?: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    isLoading: boolean;
    isOpen: boolean;
    disabled?: boolean;
    suggestions: AddressSuggestion[];
    selectedIndex: number;
    onSuggestionSelect: (suggestion: AddressSuggestion) => void;
    limit?: number;
  };
  inputClassName?: string;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

export const DEFAULT_COUNTRY_OPTIONS: ComboboxOption[] = [
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

const STATE_OPTIONS: ComboboxOption[] = [
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AddressFields = forwardRef<HTMLDivElement, AddressFieldsProps>(
  (
    {
      value,
      onChange,
      disabled = false,
      errors = {},
      required = {},
      size = 'md',
      variant = 'default',
      className,
      showCountry = true,
      countryOptions = DEFAULT_COUNTRY_OPTIONS,
      label,
      placeholder,
      streetAddressProps,
      inputClassName,
    },
    ref
  ) => {
    const listboxId = useUniqueId('address-suggestions-listbox');

    const safe: Partial<Address> = value ?? {
      address: '',
      apartment: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
    };

    const update = (field: keyof Address, v: string) =>
      onChange({ ...safe, [field]: v });

    const hasError = (field: keyof Address) => !!errors[field];
    const getError = (field: keyof Address) => errors[field];
    const isRequired = (field: keyof Address) => !!required[field];

    const fieldCn = (field: keyof Address) =>
      cn(hasError(field) && 'border-red-500 dark:border-red-400', inputClassName);

    const isUS = safe.country === 'US';

    return (
      <div ref={ref} className={cn('space-y-4', className)}>

        {/* ── Street address + autocomplete ─────────────────────────── */}
        <div className="relative">
          <Input
            label={label}
            placeholder={placeholder ?? 'Street address'}
            value={streetAddressProps?.value ?? safe.address ?? ''}
            onChange={(v) =>
              streetAddressProps ? streetAddressProps.onChange(v) : update('address', v)
            }
            disabled={disabled}
            required={isRequired('address')}
            error={getError('address')}
            variant={hasError('address') ? 'error' : variant}
            size={size}
            className={cn(
              fieldCn('address'),
              streetAddressProps?.isOpen && 'ring-2 ring-accent-500/50'
            )}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={streetAddressProps?.isOpen ?? false}
            aria-controls={streetAddressProps?.isOpen ? listboxId : undefined}
            aria-activedescendant={
              streetAddressProps?.selectedIndex >= 0 &&
              streetAddressProps.suggestions[streetAddressProps.selectedIndex]
                ? `address-suggestion-${streetAddressProps.suggestions[streetAddressProps.selectedIndex].id}`
                : undefined
            }
            onKeyDown={streetAddressProps?.onKeyDown}
          />

          {/* Spinner — uses accent token, not hardcoded blue */}
          {streetAddressProps?.isLoading && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent-500" />
            </div>
          )}

          {/* Autocomplete suggestions dropdown */}
          {streetAddressProps?.isOpen && !streetAddressProps.disabled && (
            <div
              role="listbox"
              id={listboxId}
              aria-label="Address suggestions"
              data-testid="autocomplete-dropdown"
              className={cn(
                'absolute z-50 mt-1 w-full overflow-y-auto rounded-xl',
                'max-h-60 border border-white/10',
                'bg-surface-overlay/95 backdrop-blur-2xl shadow-glass',
              )}
            >
              {streetAddressProps.suggestions.length > 0 ? (
                <ul className="py-1">
                  {streetAddressProps.suggestions.map((s, i) => {
                    const isActive = i === streetAddressProps.selectedIndex;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          role="option"
                          id={`address-suggestion-${s.id}`}
                          aria-selected={isActive}
                          onClick={() => streetAddressProps.onSuggestionSelect(s)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              streetAddressProps.onSuggestionSelect(s);
                            }
                          }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm transition-colors duration-150',
                            isActive
                              ? 'bg-accent-500/15 text-accent-400'
                              : 'text-input-text hover:bg-white/[0.08]'
                          )}
                        >
                          {s.formatted}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-3 py-2 text-sm text-input-placeholder">
                  No suggestions found.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Apartment / suite ─────────────────────────────────────── */}
        <Input
          label=""
          placeholder="Apartment, suite, etc. (optional)"
          value={safe.apartment ?? ''}
          onChange={(v) => update('apartment', v)}
          disabled={disabled}
          required={false}
          error={getError('apartment')}
          variant={hasError('apartment') ? 'error' : variant}
          size={size}
          className={fieldCn('apartment')}
        />

        {/* ── City / State / ZIP ────────────────────────────────────── */}
        <div className={cn('grid gap-4 grid-cols-1', showCountry ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>

          {/* City */}
          <div className={showCountry ? 'sm:col-span-2' : 'sm:col-span-1'}>
            <Input
              label=""
              placeholder="City"
              value={safe.city ?? ''}
              onChange={(v) => update('city', v)}
              disabled={disabled}
              required={isRequired('city')}
              error={getError('city')}
              variant={hasError('city') ? 'error' : variant}
              size={size}
              className={fieldCn('city')}
            />
          </div>

          {/* State — Combobox for US, plain Input otherwise */}
          <div>
            {isUS ? (
              <>
                <Combobox
                  label=""
                  placeholder="State"
                  value={safe.state ?? ''}
                  onChange={(v) => update('state', v)}
                  options={STATE_OPTIONS}
                  disabled={disabled}
                  searchable
                  className={cn(fieldCn('state'), hasError('state') && 'border-red-500')}
                />
                {hasError('state') && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    {getError('state')}
                  </p>
                )}
              </>
            ) : (
              <Input
                label=""
                placeholder="State / Province"
                value={safe.state ?? ''}
                onChange={(v) => update('state', v)}
                disabled={disabled}
                required={isRequired('state')}
                error={getError('state')}
                variant={hasError('state') ? 'error' : variant}
                size={size}
                className={fieldCn('state')}
              />
            )}
          </div>

          {/* ZIP / Postal code */}
          <div>
            <Input
              label=""
              placeholder={isUS ? 'ZIP code' : 'Postal code'}
              value={safe.postalCode ?? ''}
              onChange={(v) => update('postalCode', v)}
              disabled={disabled}
              required={isRequired('postalCode')}
              error={getError('postalCode')}
              variant={hasError('postalCode') ? 'error' : variant}
              size={size}
              className={fieldCn('postalCode')}
            />
          </div>

          {/* Country */}
          {showCountry && (
            <div>
              <Combobox
                label=""
                placeholder="Country"
                value={safe.country ?? ''}
                onChange={(v) => update('country', v)}
                options={countryOptions}
                disabled={disabled}
                searchable
                className={fieldCn('country')}
              />
              {hasError('country') && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {getError('country')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Error summary ─────────────────────────────────────────── */}
        {Object.values(errors).some(Boolean) && (
          <p className="text-sm text-red-500 dark:text-red-400">
            Please correct the errors above.
          </p>
        )}
      </div>
    );
  }
);

AddressFields.displayName = 'AddressFields';
