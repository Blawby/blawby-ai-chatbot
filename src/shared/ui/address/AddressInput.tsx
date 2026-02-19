import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { AddressFields } from './AddressFields';
import { cn } from '@/shared/utils/cn';
import type { Address, AddressSuggestion } from '@/shared/types/address';
import type { ComboboxOption } from '@/shared/ui/input/Combobox';

export interface AddressInputProps {
  value: Partial<Address>;
  onChange: (address: Partial<Address>) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof Address, string>>;
  required?: Partial<Record<keyof Address, boolean>>;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  className?: string;
  description?: string;
  label?: string;
  placeholder?: string;
  showCountry?: boolean;
  countryOptions?: ComboboxOption[];
  minChars?: number;
  debounceMs?: number;
  enableAutocomplete?: boolean;
  autocompleteUrl?: string;
  limit?: number;
  country?: string;
  inputClassName?: string;
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
  description,
  label,
  placeholder,
  showCountry = true,
  countryOptions,
  minChars = 3,
  debounceMs = 300,
  enableAutocomplete = true,
  autocompleteUrl = '/api/geo/autocomplete',
  limit = 5, // Back to 5 results like Shopify
  country = 'US', // Default to USA to favor US addresses,
  inputClassName
}: AddressInputProps) => {
  const [autocompleteState, setAutocompleteState] = useState<AutocompleteState>({
    suggestions: [],
    isLoading: false,
    isOpen: false,
    selectedIndex: -1,
    error: null,
    disabled: false,
  });

  // Default address value to prevent null issues
  const safeValue = useMemo(() => (
    value || { address: '', apartment: '', city: '', state: '', postalCode: '', country: 'US' }
  ), [value]);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (text: string) => {
    if (!enableAutocomplete || text.length < minChars || autocompleteState.disabled) {
      setAutocompleteState(prev => ({ ...prev, suggestions: [], isLoading: false }));
      return;
    }

    setAutocompleteState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // In development with tunnel, use the tunnel URL for worker API calls
      const isDev = import.meta.env.DEV;
      const tunnelUrl = import.meta.env.VITE_TUNNEL_URL;
      const baseUrl = isDev && tunnelUrl ? tunnelUrl : window.location.origin;
      const url = new URL(autocompleteUrl, baseUrl);
      url.searchParams.set('text', text);
      url.searchParams.set('limit', limit.toString());
      
      // Add country filter to favor specific country (default US)
      if (country) {
        url.searchParams.set('country', country);
      } else if (value?.country) {
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
      setAutocompleteState(prev => {
        const newState = {
          ...prev,
          suggestions: data.suggestions || [],
          isLoading: false,
          isOpen: data.suggestions?.length > 0,
        };
        return newState;
      });
    } catch (_error) {
      setAutocompleteState(prev => ({
        ...prev,
        suggestions: [],
        isLoading: false,
        error: 'Failed to fetch suggestions',
      }));
    }
  }, [enableAutocomplete, minChars, autocompleteUrl, autocompleteState.disabled, limit, country, value?.country]);

  // Debounced search
  const debouncedSearch = useCallback((text: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(text);
    }, debounceMs);
  }, [fetchSuggestions, debounceMs]);

  // Handle street address input change
  const handleStreetAddressChange = useCallback((text: string) => {
    // Update address field using safeValue to prevent undefined issues
    onChange({
      ...safeValue,
      address: text,
    });
    
    // Trigger autocomplete if enabled
    if (enableAutocomplete && text.length >= minChars) {
      debouncedSearch(text);
    } else {
      setAutocompleteState(prev => ({ ...prev, suggestions: [], isOpen: false }));
    }
  }, [safeValue, enableAutocomplete, minChars, debouncedSearch, onChange]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion: AddressSuggestion) => {
    onChange(suggestion.address);
    setAutocompleteState(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
  }, [onChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
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
  }, [autocompleteState.isOpen, autocompleteState.selectedIndex, autocompleteState.suggestions, handleSuggestionSelect]);

  // Handle address field changes (for non-street fields)
  const handleAddressChange = useCallback((address: Partial<Address>) => {
    onChange(address);
  }, [onChange]);




  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Description */}
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
          {description}
        </p>
      )}
      
      {/* Error */}
      {(errors.address || errors.city || errors.state || errors.postalCode || errors.country) && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1 mb-4">
          {errors.address || errors.city || errors.state || errors.postalCode || errors.country}
        </p>
      )}

      {/* Address Fields with Autocomplete on Street Address */}
      <div className="space-y-4">
        <AddressFields
          value={safeValue}
          onChange={handleAddressChange}
          disabled={disabled}
          errors={errors}
          required={required}
          size={size}
          variant={variant}
          showCountry={showCountry}
          countryOptions={countryOptions}
          label={label}
          placeholder={placeholder}
          streetAddressProps={{
            value: safeValue.address || '',
            onChange: handleStreetAddressChange,
            onKeyDown: handleKeyDown,
            isLoading: autocompleteState.isLoading,
            isOpen: autocompleteState.isOpen,
            disabled: autocompleteState.disabled || disabled,
            suggestions: autocompleteState.suggestions,
            selectedIndex: autocompleteState.selectedIndex,
            onSuggestionSelect: handleSuggestionSelect,
            limit,
          }}
          inputClassName={inputClassName}
        />
      </div>

      {/* Error message */}
      {autocompleteState.error && (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
          {autocompleteState.error}
        </div>
      )}
    </div>
  );
};
