import { forwardRef, useCallback, useState, useEffect, useRef } from 'preact/compat';
import { PhoneIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { useUniqueId } from '../../../hooks/useUniqueId';

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

export interface PhoneInputProps {
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
  namespace: _namespace = 'common'
}, ref) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  
  const [selectedCountryCode, setSelectedCountryCode] = useState(countryCode);

  useEffect(() => {
    setSelectedCountryCode(countryCode);
  }, [countryCode]);

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
    setSelectedCountryCode(country.code);
    onCountryChange?.(country.code);
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  }, [onCountryChange]);

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
    if (isDropdownOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
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
  const displayPlaceholder = placeholder;
  const displayError = error;

  // Generate stable IDs for accessibility
  const baseId = useUniqueId('phone-input');
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
    default: 'border-gray-300 dark:border-gray-600 focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500'
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
    const formattedValue = formatPhoneNumber(rawValue);
    onChange?.(formattedValue);
  }, [onChange, formatPhoneNumber]);

  const inputClasses = cn(
    'w-full border rounded-lg bg-white dark:bg-dark-input-bg text-gray-900 dark:text-white',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    sizeClasses[size],
    iconPaddingClasses[size],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
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
              disabled={disabled}
              aria-expanded={isDropdownOpen}
              aria-haspopup="menu"
              aria-label={`Select country code. Current: ${currentCountry.name} (${currentCountry.code})`}
              className={cn(
                "inline-flex items-center border border-gray-300 dark:border-gray-600 rounded-l-lg bg-white dark:bg-dark-input-bg text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-colors",
                sizeClasses[size],
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span className="text-base mr-1">{currentCountry.emoji}</span>
              <span className="text-sm">{currentCountry.code}</span>
              <ChevronDownIcon className="w-3 h-3 ml-1" />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg w-52 top-full left-0 mt-1">
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
                          "inline-flex w-full px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700",
                          index === focusedIndex && "bg-gray-100 dark:bg-gray-700"
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
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <PhoneIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
          
          <input
            ref={ref}
            id={inputId}
            type="tel"
            value={value}
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
        <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
