import { useState, useRef, useEffect, useMemo, useCallback } from 'preact/hooks';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';

export interface SelectOption {
  value: string;
  label: string;
  labelKey?: string;
}

export interface SelectProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  description?: string;
  disabled?: boolean;
  className?: string;
  direction?: 'up' | 'down';
  mobile?: boolean;
  placeholder?: string;
  searchable?: boolean;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  namespace?: string;
}

export const Select = ({
  label,
  value,
  options,
  onChange,
  description,
  disabled = false,
  className = '',
  direction = 'down',
  mobile = false,
  placeholder = 'Select an option',
  searchable = false,
  labelKey,
  descriptionKey,
  placeholderKey,
  namespace = 'common'
}: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Generate stable unique IDs for accessibility
  const dropdownId = useMemo(() => `select-${Math.random().toString(36).substr(2, 9)}`, []);
  const listboxId = `${dropdownId}-listbox`;

  const { t } = useTranslation(namespace);
  const displayLabel = labelKey ? t(labelKey) : label;
  const displayDescription = descriptionKey ? t(descriptionKey) : description;
  const displayPlaceholder = placeholderKey ? t(placeholderKey) : placeholder;

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm) return options;
    return options.filter(option => 
      option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm, searchable]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setIsOpen(true);
        setFocusedIndex(filteredOptions.length > 0 ? 0 : -1);
      }
      return;
    }

    // Guard against empty options list
    if (filteredOptions.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => (prev + 1) % filteredOptions.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => prev <= 0 ? filteredOptions.length - 1 : prev - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          onChange(filteredOptions[focusedIndex].value);
          setIsOpen(false);
          setFocusedIndex(-1);
          setSearchTerm('');
          buttonRef.current?.focus();
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        setSearchTerm('');
        buttonRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        setFocusedIndex(-1);
        setSearchTerm('');
        break;
    }
  }, [isOpen, focusedIndex, filteredOptions, onChange]);

  // Handle keyboard events
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, focusedIndex, handleKeyDown]);

  const selectedOption = options.find(opt => opt.value === value);

  // Mobile layout - full width with arrow
  if (mobile) {
    return (
      <div className={cn('px-4 py-3 relative', className)} ref={dropdownRef}>
        <button
          type="button"
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-disabled={disabled}
          className={cn(
            'w-full flex items-center justify-between px-0 py-0 text-sm text-gray-900 dark:text-gray-100',
            'hover:bg-transparent focus:outline-none',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="flex flex-col items-start">
            {displayLabel && (
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{displayLabel}</span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {selectedOption?.label || displayPlaceholder}
            </span>
          </div>
          <ChevronDownIcon className={cn(
            'w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform',
            isOpen && 'rotate-180'
          )} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div 
            id={listboxId}
            role="listbox"
            className={cn(
              "absolute left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50",
              direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
            )}
          >
            <div className="py-1">
              {searchable && (
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                    placeholder="Search..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                    autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                  />
                </div>
              )}
              {filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  id={`${dropdownId}-option-${option.value}`}
                  role="option"
                  aria-selected={value === option.value}
                  tabIndex={-1}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setFocusedIndex(-1);
                    setSearchTerm('');
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100',
                    'hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between',
                    'focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700',
                    value === option.value && 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400',
                    focusedIndex === index && 'bg-gray-100 dark:bg-gray-700'
                  )}
                >
                  <span>{option.label}</span>
                  {value === option.value && (
                    <CheckIcon className="w-4 h-4 text-accent-600 dark:text-accent-400" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {displayDescription && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {displayDescription}
          </p>
        )}
      </div>
    );
  }

  // Desktop layout - inline button style
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 rounded-md',
          'hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <span>{selectedOption?.label || displayPlaceholder}</span>
        <ChevronDownIcon className={cn(
          'w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute right-0 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden flex flex-col",
            direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          )}
        >
          <div className="py-1 overflow-y-auto">
            {searchable && (
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                  placeholder="Search..."
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                  autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                />
              </div>
            )}
            {filteredOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                id={`${dropdownId}-option-${option.value}`}
                role="option"
                aria-selected={value === option.value}
                tabIndex={-1}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setFocusedIndex(-1);
                  setSearchTerm('');
                }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100',
                  'hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between',
                  'focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700',
                  value === option.value && 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400',
                  focusedIndex === index && 'bg-gray-100 dark:bg-gray-700'
                )}
              >
                <span>{option.label}</span>
                {value === option.value && (
                  <CheckIcon className="w-4 h-4 text-accent-600 dark:text-accent-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
