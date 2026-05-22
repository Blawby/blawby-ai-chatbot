import { forwardRef, useCallback, useState, useEffect, useMemo, useRef } from 'preact/compat';
import { Phone, ChevronDown, Check, X, Search } from 'lucide-preact';
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from 'libphonenumber-js/min';

import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

interface CountryEntry {
  iso: CountryCode;
  name: string;
  callingCode: string;
  emoji: string;
}

const REGIONAL_INDICATOR_OFFSET = 127397;
const isoToFlagEmoji = (iso: string): string =>
  iso.replace(/./g, (ch) => String.fromCodePoint(REGIONAL_INDICATOR_OFFSET + ch.charCodeAt(0)));

const regionNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

let cachedCountries: CountryEntry[] | null = null;
const getCountryList = (): CountryEntry[] => {
  if (cachedCountries) return cachedCountries;
  cachedCountries = getCountries()
    .map((iso): CountryEntry => ({
      iso,
      name: regionNames?.of(iso) ?? iso,
      callingCode: getCountryCallingCode(iso),
      emoji: isoToFlagEmoji(iso),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountries;
};

// When a calling code maps to multiple countries (e.g. +1 → US, CA, JM…), pick
// the most common default so the picker doesn't surprise users.
const callingCodeDefaults: Record<string, CountryCode> = {
  '1': 'US',
  '7': 'RU',
  '44': 'GB',
  '47': 'NO',
  '358': 'FI',
  '590': 'GP',
  '599': 'CW',
};

const isIsoCode = (value: string): value is CountryCode => /^[A-Z]{2}$/.test(value);

const resolveIsoFromProp = (input?: string): CountryCode => {
  if (!input) return 'US';
  if (isIsoCode(input)) return input;
  if (input.startsWith('+')) {
    const digits = input.slice(1).replace(/\D/g, '');
    if (digits && callingCodeDefaults[digits]) return callingCodeDefaults[digits];
    if (digits) {
      const match = getCountryList().find((c) => c.callingCode === digits);
      if (match) return match.iso;
    }
  }
  return 'US';
};

const detectIsoFromValue = (value: string, fallback: CountryCode): CountryCode => {
  if (!value) return fallback;
  const parsed = parsePhoneNumberFromString(value);
  if (parsed?.country) return parsed.country;
  if (value.trimStart().startsWith('+')) {
    const trimmed = value.trimStart().slice(1);
    const digitMatch = trimmed.match(/^(\d{1,4})/);
    if (digitMatch) {
      const digits = digitMatch[1];
      for (let len = digits.length; len > 0; len -= 1) {
        const slice = digits.slice(0, len);
        if (callingCodeDefaults[slice]) return callingCodeDefaults[slice];
        const match = getCountryList().find((c) => c.callingCode === slice);
        if (match) return match.iso;
      }
    }
  }
  return fallback;
};

const extractNationalPart = (value: string, iso: CountryCode): string => {
  if (!value) return '';
  const parsed = parsePhoneNumberFromString(value, iso);
  if (parsed) return parsed.formatNational();
  const trimmed = value.trimStart();
  if (trimmed.startsWith('+')) {
    return trimmed.slice(1).replace(/^\d{1,4}\s*/, '');
  }
  return value;
};

const formatNationalDisplay = (raw: string, iso: CountryCode): string => {
  if (!raw) return '';
  return new AsYouType(iso).input(raw);
};

const buildEmittedValue = (
  national: string,
  iso: CountryCode,
  withCountryCode: boolean,
): string => {
  const trimmed = national.trim();
  if (!trimmed) return '';
  if (!withCountryCode) return trimmed;
  return `+${getCountryCallingCode(iso)} ${trimmed}`;
};

export interface PhoneInputProps {
  id?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  label?: string;
  description?: string;
  error?: string;
  /**
   * Initial / preferred country. Accepts an ISO alpha-2 code ('US', 'GB') or
   * a legacy calling-code form ('+1'). When the bound `value` already
   * carries a country prefix, the parsed country wins over this prop.
   */
  countryCode?: string;
  /** Fires with the selected ISO alpha-2 country code. */
  onCountryChange?: (iso: CountryCode) => void;
  showCountryCode?: boolean;
  /** No-op when showCountryCode=true (AsYouType always formats). Retained for back-compat. */
  format?: boolean;
  /** When true, render an inline check/X icon based on isValidPhoneNumber. */
  showValidation?: boolean;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  'data-testid'?: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(({
  value = '',
  onChange,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  size = 'md',
  variant = 'default',
  label,
  description,
  error,
  countryCode,
  onCountryChange,
  showCountryCode = true,
  format: _format = true,
  showValidation = false,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  placeholderKey: _placeholderKey,
  errorKey: _errorKey,
  namespace: _namespace = 'common',
  id,
  name,
  'data-testid': dataTestId,
}, ref) => {
  const countries = useMemo(() => getCountryList(), []);
  const propIso = useMemo(() => resolveIsoFromProp(countryCode), [countryCode]);
  const detectedIso = useMemo(() => detectIsoFromValue(value, propIso), [value, propIso]);
  const [manualIso, setManualIso] = useState<CountryCode | null>(null);
  const selectedIso = manualIso ?? detectedIso;

  const currentCountry = useMemo(
    () => countries.find((c) => c.iso === selectedIso) ?? countries.find((c) => c.iso === 'US') ?? countries[0],
    [countries, selectedIso],
  );

  const nationalPart = useMemo(
    () => extractNationalPart(value, selectedIso),
    [value, selectedIso],
  );
  const displayValue = useMemo(
    () => formatNationalDisplay(nationalPart, selectedIso),
    [nationalPart, selectedIso],
  );

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCountries = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    if (!term) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.iso.toLowerCase().includes(term) ||
        c.callingCode.startsWith(term.replace(/^\+/, '')),
    );
  }, [countries, filterText]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setFilterText('');
        setFocusedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isDropdownOpen) {
      // Focus the search input on the next tick so the dropdown has mounted.
      const handle = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [isDropdownOpen]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    const item = listRef.current?.children[focusedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const selectCountry = useCallback(
    (country: CountryEntry) => {
      setManualIso(country.iso);
      setIsDropdownOpen(false);
      setFilterText('');
      setFocusedIndex(-1);
      onCountryChange?.(country.iso);
      const nextValue = buildEmittedValue(nationalPart, country.iso, showCountryCode);
      onChange?.(nextValue);
      buttonRef.current?.focus();
    },
    [nationalPart, onChange, onCountryChange, showCountryCode],
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          setIsDropdownOpen(false);
          setFilterText('');
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) =>
            filteredCountries.length === 0 ? -1 : (prev + 1) % filteredCountries.length,
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) =>
            filteredCountries.length === 0
              ? -1
              : prev <= 0
              ? filteredCountries.length - 1
              : prev - 1,
          );
          break;
        case 'Enter': {
          event.preventDefault();
          const target = filteredCountries[focusedIndex] ?? filteredCountries[0];
          if (target) selectCountry(target);
          break;
        }
        default:
          break;
      }
    },
    [filteredCountries, focusedIndex, selectCountry],
  );

  const handleTriggerKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      setFilterText('');
      setFocusedIndex(0);
      setIsDropdownOpen(true);
    }
  }, []);

  const handleInput = useCallback(
    (event: Event) => {
      const target = event.target as HTMLInputElement;
      const rawValue = target.value;
      const startsWithPlus = rawValue.trimStart().startsWith('+');

      const nextIso = startsWithPlus ? detectIsoFromValue(rawValue, selectedIso) : selectedIso;
      if (startsWithPlus && manualIso !== null) {
        setManualIso(null);
      }

      const nextNational = startsWithPlus ? extractNationalPart(rawValue, nextIso) : rawValue;
      const nextValue = showCountryCode
        ? buildEmittedValue(nextNational, nextIso, true)
        : formatNationalDisplay(rawValue, nextIso);
      onChange?.(nextValue);
    },
    [manualIso, onChange, selectedIso, showCountryCode],
  );

  const generatedId = useUniqueId('phone-input');
  const baseId = id || generatedId;
  const inputId = baseId;
  const descriptionId = `${baseId}-description`;
  const errorId = `${baseId}-error`;
  const validationErrorId = `${baseId}-validation-error`;

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm h-8',
    md: 'px-3 py-2 text-sm h-10',
    lg: 'px-4 py-3 text-base h-12',
  } as const;

  const iconPaddingClasses = {
    sm: 'pl-8',
    md: 'pl-10',
    lg: 'pl-12',
  } as const;

  const rightIconPaddingClasses = {
    sm: 'pr-8',
    md: 'pr-10',
    lg: 'pr-12',
  } as const;

  const variantClasses = {
    default: 'focus:ring-2 ring-inset focus:ring-accent-500/30',
    error: 'ring-2 ring-inset ring-red-500/40 focus:ring-red-500/60',
    success: 'ring-2 ring-inset ring-green-500/40',
  } as const;

  const trimmedValue = (value ?? '').trim();
  const validationIsValid = useMemo(() => {
    if (!trimmedValue) return null;
    try {
      return isValidPhoneNumber(trimmedValue, selectedIso);
    } catch {
      return false;
    }
  }, [trimmedValue, selectedIso]);
  const showInvalidValidation = showValidation && trimmedValue.length > 0 && validationIsValid === false;
  const isInvalid = Boolean(error) || showInvalidValidation;

  const inputClasses = cn(
    'w-full rounded-xl text-input-text placeholder:text-input-placeholder',
    'focus:outline-none transition-all duration-200',
    'input-surface border-none',
    sizeClasses[size],
    showCountryCode ? null : iconPaddingClasses[size],
    showValidation && trimmedValue.length > 0 ? rightIconPaddingClasses[size] : null,
    variantClasses[variant],
    isInvalid && variant === 'default' && 'isError',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  );

  const placeholderForDisplay = useMemo(() => {
    if (!placeholder) return placeholder;
    if (!showCountryCode) return placeholder;
    const stripped = placeholder.replace(/^\s*\+\d{1,4}\s*/, '');
    return stripped || placeholder;
  }, [placeholder, showCountryCode]);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="flex items-stretch">
        {showCountryCode && (
          <div className="relative" ref={dropdownRef}>
            <button
              ref={buttonRef}
              type="button"
              onClick={() => {
                setFilterText('');
                setFocusedIndex(0);
                setIsDropdownOpen((open) => !open);
              }}
              onKeyDown={handleTriggerKeyDown}
              disabled={disabled}
              aria-expanded={isDropdownOpen}
              aria-haspopup="listbox"
              aria-label={`Select country. Current: ${currentCountry.name} (+${currentCountry.callingCode})`}
              className={cn(
                'inline-flex items-center rounded-l-xl rounded-r-none text-input-text hover:bg-surface-utility/40 focus:outline-none focus:ring-2 ring-inset focus:ring-accent-500 transition-colors input-surface border-r border-line-subtle',
                sizeClasses[size],
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className="text-base mr-1" aria-hidden="true">{currentCountry.emoji}</span>
              <span className="text-sm">+{currentCountry.callingCode}</span>
              <ChevronDown className="w-3 h-3 ml-1 shrink-0" aria-hidden="true" />
            </button>

            {isDropdownOpen && (
              <div
                className="absolute z-10 panel border border-line-subtle rounded-xl shadow-glass w-64 top-full left-0 mt-1"
                role="dialog"
              >
                <div className="p-2 border-b border-line-subtle">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-input-placeholder" aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={filterText}
                      onInput={(e) => {
                        setFilterText((e.target as HTMLInputElement).value);
                        setFocusedIndex(0);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search country or code"
                      aria-label="Search country"
                      className="w-full pl-7 pr-2 py-1 text-sm rounded-md input-surface border-none focus:outline-none focus:ring-2 ring-inset focus:ring-accent-500/30"
                    />
                  </div>
                </div>
                <div
                  ref={listRef}
                  role="listbox"
                  aria-label="Country selection"
                  tabIndex={-1}
                  aria-activedescendant={
                    focusedIndex >= 0 && filteredCountries[focusedIndex]
                      ? `${baseId}-country-${filteredCountries[focusedIndex].iso}`
                      : undefined
                  }
                  className="max-h-64 overflow-y-auto py-1 text-sm"
                >
                  {filteredCountries.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-input-placeholder">No matches</div>
                  ) : (
                    filteredCountries.map((country, index) => (
                      <button
                        key={country.iso}
                        id={`${baseId}-country-${country.iso}`}
                        type="button"
                        role="option"
                        aria-selected={country.iso === selectedIso}
                        onClick={() => selectCountry(country)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        className={cn(
                          'inline-flex w-full px-3 py-2 text-sm text-input-text hover:bg-surface-utility/40 focus:outline-none',
                          index === focusedIndex && 'bg-surface-utility/60',
                          country.iso === selectedIso && 'font-medium',
                        )}
                        tabIndex={-1}
                      >
                        <span className="inline-flex items-center gap-2 w-full">
                          <span className="text-base" aria-hidden="true">{country.emoji}</span>
                          <span className="flex-1 text-left truncate">{country.name}</span>
                          <span className="text-input-placeholder">+{country.callingCode}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative flex-1">
          {!showCountryCode ? (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Phone className="w-4 h-4 text-input-placeholder shrink-0" aria-hidden="true" />
            </div>
          ) : null}

          <input
            ref={ref}
            id={inputId}
            name={name}
            type="tel"
            autoComplete="tel"
            value={displayValue}
            onInput={handleInput}
            placeholder={placeholderForDisplay}
            disabled={disabled}
            required={required}
            aria-required={required}
            aria-invalid={isInvalid ? 'true' : undefined}
            aria-describedby={
              error
                ? errorId
                : showInvalidValidation
                ? validationErrorId
                : description
                ? descriptionId
                : undefined
            }
            data-testid={dataTestId}
            className={cn(
              inputClasses,
              showCountryCode ? 'rounded-l-none border-l-0' : 'rounded-xl',
              'rounded-r-xl',
            )}
          />

          {showValidation && trimmedValue.length > 0 && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              {validationIsValid ? (
                <Icon icon={Check} className="w-4 h-4 text-accent-success" />
              ) : (
                <Icon icon={X} className="w-4 h-4 text-accent-error" />
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      {showInvalidValidation && !error && (
        <p id={validationErrorId} className="text-xs text-red-600 dark:text-red-400 mt-1">
          Please enter a valid phone number for {currentCountry.name}
        </p>
      )}

      {description && !error && !showInvalidValidation && (
        <p id={descriptionId} className="text-xs text-input-placeholder mt-1">
          {description}
        </p>
      )}
    </div>
  );
});
