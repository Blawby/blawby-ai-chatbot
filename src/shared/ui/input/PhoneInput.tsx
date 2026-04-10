import { forwardRef, useCallback, useState, useEffect, useRef } from 'preact/compat';
import { PhoneIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

// Country data with emojis and codes
const countries = [
  { code: '+1', emoji: '🇺🇸', name: 'United States' },
  { code: '+44', emoji: '🇬🇧', name: 'United Kingdom' },
  { code: '+61', emoji: '🇦🇺', name: 'Australia' },
  { code: '+49', emoji: '🇩🇪', name: 'Germany' },
  { code: '+33', emoji: '🇫🇷', name: 'France' },
  { code: '+81', emoji: '🇯🇵', name: 'Japan' },
  { code: '+86', emoji: '🇨🇳', name: 'China' },
  { code: '+91', emoji: '🇮🇳', name: 'India' },
  { code: '+55', emoji: '🇧🇷', name: 'Brazil' },
  { code: '+39', emoji: '🇮🇹', name: 'Italy' },
];

const countryCodeMatchOrder = [...countries].sort((left, right) => right.code.length - left.code.length);
const unsupportedInternationalPrefixPattern = /^(\+\d{1,3})(?=$|[\s(-])(?:[\s-]*)/;

type ParsedPhoneValue =
  | { kind: 'supported'; prefix: string; localValue: string }
  | { kind: 'unsupported'; prefix: string; localValue: string }
  | { kind: 'none'; prefix: null; localValue: string };

const normalizeSupportedCountryCode = (value?: string): string => {
  const supportedCountry = countries.find((country) => country.code === value);
  return supportedCountry?.code ?? countries[0].code;
};

const splitCombinedPhoneValue = (value: string): ParsedPhoneValue => {
  const trimmedStart = value.trimStart();
  const leadingDigitTokenMatch = trimmedStart.match(/^(\+\d{1,3})(.*)$/);

  if (leadingDigitTokenMatch) {
    const rawPrefix = leadingDigitTokenMatch[1];
    const remainder = leadingDigitTokenMatch[2].trimStart();
    const matchedCountry = countryCodeMatchOrder.find((country) => country.code === rawPrefix);

    if (matchedCountry) {
      return {
        kind: 'supported',
        prefix: matchedCountry.code,
        localValue: trimmedStart.slice(matchedCountry.code.length).trimStart(),
      };
    }

    return {
      kind: 'unsupported',
      prefix: rawPrefix,
      localValue: remainder,
    };
  }

  const matchedCountry = countryCodeMatchOrder.find((country) => trimmedStart.startsWith(country.code));
  if (!matchedCountry) {
    const unsupportedPrefixMatch = trimmedStart.match(unsupportedInternationalPrefixPattern);
    if (!unsupportedPrefixMatch) {
      return { kind: 'none', prefix: null, localValue: value };
    }

    return {
      kind: 'unsupported',
      prefix: unsupportedPrefixMatch[1],
      localValue: trimmedStart.slice(unsupportedPrefixMatch[0].length).trimStart(),
    };
  }

  return {
    kind: 'supported',
    prefix: matchedCountry.code,
    localValue: trimmedStart.slice(matchedCountry.code.length).trimStart(),
  };
};

const buildCombinedPhoneValue = (prefix: string, localValue: string): string => {
  const trimmedLocalValue = localValue.trim();
  if (!trimmedLocalValue) return '';
  return `${prefix} ${trimmedLocalValue}`;
};

const resolvePhonePrefix = (
  manualCountryCode: string | null,
  currentPhoneValue: ParsedPhoneValue | null,
  nextPhoneValue: ParsedPhoneValue | null,
  normalizedCountryCode: string
): string => {
  if (manualCountryCode) return manualCountryCode;
  if (nextPhoneValue?.kind === 'supported' || nextPhoneValue?.kind === 'unsupported') {
    return nextPhoneValue.prefix;
  }
  if (currentPhoneValue?.kind === 'supported' || currentPhoneValue?.kind === 'unsupported') {
    return currentPhoneValue.prefix;
  }
  return normalizedCountryCode;
};

const getPhoneInputPlaceholder = (placeholder?: string): string | undefined => {
  if (!placeholder) return placeholder;

  const trimmedStart = placeholder.trimStart();
  const matchedCountry = countryCodeMatchOrder.find((country) => trimmedStart.startsWith(country.code));
  if (!matchedCountry) return placeholder;

  const localPlaceholder = trimmedStart.slice(matchedCountry.code.length).trimStart();
  return localPlaceholder || placeholder;
};

export interface PhoneInputProps {
  id?: string;
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
  countryCode?: string;
  onCountryChange?: (countryCode: string) => void;
  showCountryCode?: boolean;
  format?: boolean;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
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
  countryCode = '+1',
  onCountryChange,
  showCountryCode = true,
  format = true,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  placeholderKey: _placeholderKey,
  errorKey: _errorKey,
  namespace: _namespace = 'common',
  id
}, ref) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const manualSelectionRef = useRef<{ value: string; countryCode: string } | null>(null);

  const normalizedCountryCode = normalizeSupportedCountryCode(countryCode);
  const parsedPhoneValue = showCountryCode ? splitCombinedPhoneValue(value) : null;
  const [manualCountryCode, setManualCountryCode] = useState<string | null>(null);
  const activeManualCountryCode =
    showCountryCode &&
    parsedPhoneValue?.kind === 'none' &&
    manualSelectionRef.current?.value === value &&
    manualSelectionRef.current?.countryCode === normalizedCountryCode
      ? manualCountryCode
      : null;
  const selectedCountryCode = parsedPhoneValue?.kind === 'supported'
    ? parsedPhoneValue.prefix
    : activeManualCountryCode ?? normalizedCountryCode;

  const currentCountry = countries.find(c => c.code === selectedCountryCode) || countries[0];
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleCountrySelect = useCallback((country: typeof countries[0]) => {
    if (showCountryCode) {
      const nextValue = buildCombinedPhoneValue(country.code, parsedPhoneValue?.localValue ?? '');
      const emittedValue = nextValue || country.code;
      manualSelectionRef.current = {
        value: emittedValue,
        countryCode: normalizedCountryCode,
      };
      setManualCountryCode(country.code);
      onCountryChange?.(country.code);
      onChange?.(emittedValue);
    }
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  }, [normalizedCountryCode, onChange, onCountryChange, parsedPhoneValue?.localValue, showCountryCode]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isDropdownOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsDropdownOpen(true);
        setFocusedIndex(0);
        return;
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % countries.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => prev <= 0 ? countries.length - 1 : prev - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < countries.length) {
          handleCountrySelect(countries[focusedIndex]);
        }
        break;
      case 'Tab':
        // Allow default tab behavior but close dropdown
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
        break;
    }
  }, [isDropdownOpen, focusedIndex, handleCountrySelect]);

  // Focus management
  useEffect(() => {
    if (isDropdownOpen && listRef.current) {
      const focusedItem = listRef.current.children[focusedIndex] as HTMLElement;
      if (focusedItem) {
        focusedItem.focus();
      }
    }
  }, [isDropdownOpen, focusedIndex]);

  // Add keyboard event listener
  useEffect(() => {
    const listElement = listRef.current;
    if (!isDropdownOpen || !listElement) return;

    listElement.addEventListener('keydown', handleKeyDown);

    return () => {
      listElement.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen, handleKeyDown]);
  
  // TODO: Add i18n support when useTranslation hook is available
  // const { t } = useTranslation(namespace);
  // const displayLabel = labelKey ? t(labelKey) : label;
  // const displayDescription = descriptionKey ? t(descriptionKey) : description;
  // const displayPlaceholder = placeholderKey ? t(placeholderKey) : placeholder;
  // const displayError = errorKey ? t(errorKey) : error;
  
  const displayLabel = label;
  const displayDescription = description;
  const displayPlaceholder = showCountryCode ? getPhoneInputPlaceholder(placeholder) : placeholder;
  const displayError = error;

  // Generate stable IDs for accessibility
  const generatedId = useUniqueId('phone-input');
  const baseId = id || generatedId;
  const inputId = baseId;
  const descriptionId = `${baseId}-description`;
  const errorId = `${baseId}-error`;

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm h-8',
    md: 'px-3 py-2 text-sm h-10',
    lg: 'px-4 py-3 text-base h-12'
  };

  const iconPaddingClasses = {
    sm: 'pl-8',
    md: 'pl-10',
    lg: 'pl-12'
  };


  const variantClasses = {
    default: 'border-input-border focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 focus:ring-green-500 focus:border-green-500'
  };

  const formatPhoneNumber = useCallback((phone: string) => {
    if (!format) return phone;
    
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX for US numbers
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  }, [format]);

  const handleChange = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const rawValue = target.value;

    if (showCountryCode) {
      const parsedRawValue = splitCombinedPhoneValue(rawValue);
      const isRawInternationalEntry =
        rawValue.trimStart().startsWith('+') && parsedRawValue.kind !== 'supported';

      if (isRawInternationalEntry) {
        manualSelectionRef.current = null;
        if (manualCountryCode !== null) {
          setManualCountryCode(null);
        }
        onChange?.(rawValue);
        return;
      }

      const droppedUnsupportedPrefix =
        parsedPhoneValue?.kind === 'unsupported' &&
        parsedRawValue.kind === 'none' &&
        !rawValue.trimStart().startsWith('+');

      if (droppedUnsupportedPrefix) {
        manualSelectionRef.current = null;
        if (manualCountryCode !== null) {
          setManualCountryCode(null);
        }
        onChange?.(rawValue);
        return;
      }

      const effectiveManualCountryCode =
        parsedRawValue.kind === 'supported' ? parsedRawValue.prefix : manualCountryCode;
      if (parsedRawValue.kind === 'supported' && parsedRawValue.prefix !== selectedCountryCode) {
        setManualCountryCode(parsedRawValue.prefix);
        onCountryChange?.(parsedRawValue.prefix);
      }

      const nextPhonePrefix = resolvePhonePrefix(
        effectiveManualCountryCode,
        parsedPhoneValue,
        parsedRawValue,
        normalizedCountryCode
      );

      const nextCombinedValue =
        parsedRawValue.kind === 'supported' && !parsedRawValue.localValue.trim()
          ? nextPhonePrefix
          : buildCombinedPhoneValue(nextPhonePrefix, parsedRawValue.localValue);

      manualSelectionRef.current =
        parsedRawValue.kind === 'supported'
          ? {
              value: nextCombinedValue,
              countryCode: normalizedCountryCode,
            }
          : null;
      onChange?.(nextCombinedValue);
      return;
    }

    const formattedValue = formatPhoneNumber(rawValue);
    onChange?.(formattedValue);
  }, [
    formatPhoneNumber,
    manualCountryCode,
    normalizedCountryCode,
    onChange,
    onCountryChange,
    parsedPhoneValue,
    selectedCountryCode,
    showCountryCode,
  ]);

  const inputClasses = cn(
    'w-full border rounded-lg text-input-text placeholder:text-input-placeholder',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    sizeClasses[size],
    showCountryCode ? null : iconPaddingClasses[size],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    variant === 'default' ? 'glass-input' : 'bg-input-bg',
    className
  );

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="flex items-stretch">
        {showCountryCode && (
          <div className="relative" ref={dropdownRef}>
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              aria-expanded={isDropdownOpen}
              aria-haspopup="menu"
              aria-label={`Select country code. Current: ${currentCountry.name} (${currentCountry.code})`}
              className={cn(
                "inline-flex items-center border border-input-border rounded-l-lg text-input-text hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-colors glass-input",
                sizeClasses[size],
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              >
              <span className="text-base mr-1">{currentCountry.emoji}</span>
              <span className="text-sm">{currentCountry.code}</span>
              <ChevronDownIcon className="w-3 h-3 ml-1 shrink-0" aria-hidden="true" />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute z-10 glass-panel border border-line-glass/30 rounded-lg shadow-glass w-52 top-full left-0 mt-1">
                <div 
                  ref={listRef}
                  role="listbox"
                  aria-label="Country selection"
                  className="py-1 text-sm"
                >
                  {countries.map((country, index) => (
                    <div key={country.code} role="option" aria-selected={index === focusedIndex}>
                      <button
                        type="button"
                        onClick={() => handleCountrySelect(country)}
                        className={cn(
                          "inline-flex w-full px-3 py-2 text-sm text-input-text hover:bg-white/[0.04] focus:outline-none focus:bg-white/[0.08]",
                          index === focusedIndex && "bg-white/[0.08]"
                        )}
                        tabIndex={-1}
                      >
                        <span className="inline-flex items-center">
                          <span className="text-base mr-2">{country.emoji}</span>
                          <span>{country.name} ({country.code})</span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="relative flex-1">
          {!showCountryCode ? (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <PhoneIcon className="w-4 h-4 text-input-placeholder shrink-0" aria-hidden="true" />
            </div>
          ) : null}
          
          <input
            ref={ref}
            id={inputId}
            type="tel"
            value={showCountryCode
              ? parsedPhoneValue?.kind === 'supported'
                ? parsedPhoneValue.localValue
                : value
              : value}
            onChange={handleChange}
            placeholder={displayPlaceholder}
            disabled={disabled}
            required={required}
            aria-required={required}
            aria-invalid={Boolean(displayError)}
            aria-describedby={displayError ? errorId : displayDescription ? descriptionId : undefined}
            className={cn(
              inputClasses,
              showCountryCode ? 'rounded-l-none border-l-0' : 'rounded-lg',
              'rounded-r-lg'
            )}
          />
        </div>
      </div>
      
      {displayError && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}
      
      {displayDescription && !displayError && (
        <p id={descriptionId} className="text-xs text-input-placeholder mt-1">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
