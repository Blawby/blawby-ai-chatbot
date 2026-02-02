import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { MapPinIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Input } from '@/shared/ui/input/Input';
import { AddressFields } from './AddressFields';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { validateAddressLoose, validateAddressStrict } from '@/shared/utils/addressValidation';
import { toApiAddress, fromApiAddress, hasAddressData } from '@/shared/utils/addressMappers';
import { formatAddressSingleLine } from '@/shared/utils/addressFormat';
import type { Address, AddressSuggestion, AddressSource } from '@/shared/types/address';

export interface AddressInputProps {
  value: Partial<Address>;
  onChange: (address: Partial<Address>) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof Address, string>>;
  required?: Partial<Record<keyof Address, boolean>>;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  className?: string;
  placeholder?: string;
  label?: string;
  description?: string;
  validationLevel?: 'loose' | 'strict';
  showCountry?: boolean;
  countryOptions?: Array<{ value: string; label: string }>;
  minChars?: number;
  debounceMs?: number;
  enableAutocomplete?: boolean;
  autocompleteUrl?: string;
}

interface AutocompleteState {
  suggestions: AddressSuggestion[];
  isLoading: boolean;
  isOpen: boolean;
  selectedIndex: number;
  error: string | null;
  disabled: boolean;
}

export const AddressInput = ({
  value,
  onChange,
  disabled = false,
  errors = {},
  required = {},
  size = 'md',
  variant = 'default',
  className = '',
  placeholder = 'Enter address or start typing...',
  label = 'Address',
  description,
  validationLevel = 'loose',
  showCountry = true,
  countryOptions,
  minChars = 3,
  debounceMs = 300,
  enableAutocomplete = true,
  autocompleteUrl = '/api/geo/autocomplete',
}: AddressInputProps) => {
  const [autocompleteState, setAutocompleteState] = useState<AutocompleteState>({
    suggestions: [],
    isLoading: false,
    isOpen: false,
    selectedIndex: -1,
    error: null,
    disabled: false,
  });

  const [searchText, setSearchText] = useState('');
  const [showStructuredFields, setShowStructuredFields] = useState(false);
  const [addressSource, setAddressSource] = useState<AddressSource>('manual');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Update search text when address changes (manual edits)
  useEffect(() => {
    if (addressSource === 'manual' && hasAddressData(value)) {
      const formatted = formatAddressSingleLine(value);
      if (formatted !== searchText) {
        setSearchText(formatted);
      }
    }
  }, [value, addressSource, searchText]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAutocompleteState(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (text: string) => {
    if (!enableAutocomplete || text.length < minChars || autocompleteState.disabled) {
      setAutocompleteState(prev => ({ ...prev, suggestions: [], isLoading: false }));
      return;
    }

    setAutocompleteState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const url = new URL(autocompleteUrl, window.location.origin);
      url.searchParams.set('text', text);
      url.searchParams.set('limit', '5');
      
      if (value.country) {
        url.searchParams.set('country', value.country);
      }

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - disable autocomplete for session
          setAutocompleteState(prev => ({ 
            ...prev, 
            disabled: true, 
            isLoading: false, 
            error: 'Autocomplete temporarily unavailable' 
          }));
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { suggestions: AddressSuggestion[] };
      setAutocompleteState(prev => ({
        ...prev,
        suggestions: data.suggestions || [],
        isLoading: false,
        isOpen: data.suggestions?.length > 0,
      }));
    } catch (error) {
      console.error('Autocomplete error:', error);
      setAutocompleteState(prev => ({
        ...prev,
        suggestions: [],
        isLoading: false,
        error: 'Failed to fetch suggestions',
      }));
    }
  }, [enableAutocomplete, minChars, autocompleteUrl, value.country, autocompleteState.disabled]);

  // Debounced search
  const debouncedSearch = useCallback((text: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(text);
    }, debounceMs);
  }, [fetchSuggestions, debounceMs]);

  // Handle input change
  const handleInputChange = (text: string) => {
    setSearchText(text);
    setAddressSource('manual');
    
    if (text.length >= minChars) {
      debouncedSearch(text);
    } else {
      setAutocompleteState(prev => ({ ...prev, suggestions: [], isOpen: false }));
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: AddressSuggestion) => {
    setSearchText(suggestion.formatted);
    setAddressSource('autocomplete');
    onChange(suggestion.address);
    setAutocompleteState(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!autocompleteState.isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setAutocompleteState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1),
        }));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setAutocompleteState(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, -1),
        }));
        break;
      case 'Enter':
        event.preventDefault();
        if (autocompleteState.selectedIndex >= 0) {
          handleSuggestionSelect(autocompleteState.suggestions[autocompleteState.selectedIndex]);
        }
        break;
      case 'Escape':
        setAutocompleteState(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
        break;
    }
  };

  // Validate address
  const validateAddress = useCallback(() => {
    const validation = validationLevel === 'strict' 
      ? validateAddressStrict(value)
      : validateAddressLoose(value);
    
    return validation;
  }, [value, validationLevel]);

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Single-line input with autocomplete */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => handleInputChange((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || autocompleteState.disabled}
            placeholder={placeholder}
            className={cn(
              'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-input-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
              size === 'sm' && 'px-2 py-1 text-sm',
              size === 'lg' && 'px-4 py-3 text-base',
              variant === 'error' && 'border-red-300 dark:border-red-600',
              'pr-10',
              autocompleteState.isOpen && 'ring-2 ring-blue-500 border-blue-500'
            )}
          />
          
          {/* Label */}
          {label && (
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              {label}
              {(required.line1 || required.city || required.state || required.postalCode || required.country) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
          )}
          
          {/* Description */}
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
          
          {/* Error */}
          {(errors.line1 || errors.city || errors.state || errors.postalCode || errors.country) && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {errors.line1 || errors.city || errors.state || errors.postalCode || errors.country}
            </p>
          )}
        
        {/* Search icon */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          {autocompleteState.isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600" />
          ) : (
            <MapPinIcon className="h-4 w-4 text-gray-400" />
          )}
        </div>

        {/* Clear button */}
        {searchText && !disabled && (
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              onChange({});
              setAutocompleteState(prev => ({ ...prev, suggestions: [], isOpen: false }));
            }}
            className="absolute inset-y-0 right-8 flex items-center pr-2 text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {autocompleteState.isOpen && !autocompleteState.disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-card-bg border border-gray-200 dark:border-dark-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {autocompleteState.suggestions.length > 0 ? (
            <ul className="py-1">
              {autocompleteState.suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.id}
                  className={cn(
                    'px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-hover',
                    index === autocompleteState.selectedIndex && 'bg-blue-50 dark:bg-blue-900/20'
                  )}
                  onClick={() => handleSuggestionSelect(suggestion)}
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {suggestion.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {suggestion.formatted}
                  </div>
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

      {/* Error message */}
      {autocompleteState.error && (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
          {autocompleteState.error}
        </div>
      )}

      {/* Toggle structured fields */}
      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowStructuredFields(!showStructuredFields)}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ChevronDownIcon
            className={cn(
              'h-4 w-4 mr-1 transition-transform',
              showStructuredFields && 'rotate-180'
            )}
          />
          {showStructuredFields ? 'Hide' : 'Show'} structured fields
        </Button>
      </div>

      {/* Structured address fields */}
      {showStructuredFields && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-dark-hover rounded-lg border border-gray-200 dark:border-dark-border">
          <AddressFields
            value={value}
            onChange={onChange}
            disabled={disabled}
            errors={errors}
            required={required}
            size={size}
            variant={variant}
            showCountry={showCountry}
            countryOptions={countryOptions}
          />
        </div>
      )}

      {/* Address source indicator */}
      {addressSource === 'autocomplete' && (
        <div className="mt-2 text-xs text-green-600 dark:text-green-400">
          ✓ Address filled from autocomplete
        </div>
      )}
    </div>
  );
};
