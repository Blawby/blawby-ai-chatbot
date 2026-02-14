import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { CheckIcon, ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';

export type ComboboxOption = { value: string; label: string; meta?: string };

type ComboboxPropsBase = {
  label: string;
  placeholder: string;
  options: ComboboxOption[];
  leading: ComponentChildren | ((selectedOption?: ComboboxOption, selectedOptions?: ComboboxOption[]) => ComponentChildren);
  className?: string;
  displayValue?: (option?: ComboboxOption) => string;
  optionLeading?: (option: ComboboxOption) => ComponentChildren;
  optionMeta?: (option: ComboboxOption) => ComponentChildren;
  disabled?: boolean;
};

export type ComboboxProps =
  | (ComboboxPropsBase & {
      multiple?: false;
      value: string;
      onChange: (value: string) => void;
    })
  | (ComboboxPropsBase & {
      multiple: true;
      value: string[];
      onChange: (value: string[]) => void;
    });

export const Combobox = ({
  label,
  placeholder,
  value,
  options,
  leading,
  onChange,
  multiple,
  className,
  displayValue,
  optionLeading,
  optionMeta,
  disabled
}: ComboboxProps) => {
  const isMultiple = multiple === true;
  const valueList = useMemo(() => {
    const raw = Array.isArray(value) ? value : (value != null ? [value] : []);
    return raw.filter((v) => v != null && v !== '');
  }, [value]);
  const selectedOptions = options.filter((option) => valueList.includes(option.value));
  const selectedOption = selectedOptions[0];
  // If no option found, treat 'value' as the raw input to display
  const resolvedDisplayValue = selectedOptions.length > 0
    ? selectedOptions.map((option) => displayValue?.(option) ?? option.label).join(', ')
    : (isMultiple && Array.isArray(value) ? value.join(', ') : (typeof value === 'string' ? value : ''));
  const [query, setQuery] = useState(resolvedDisplayValue);
  const [userTyped, setUserTyped] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputId = useMemo(
    () => `combobox-${label.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
    [label]
  );
  const listboxId = `${inputId}-listbox`;
  
  const emitChange = (val: string | string[]) => {
    if (isMultiple) {
      if (Array.isArray(val)) {
        (onChange as (v: string[]) => void)(val);
      } else {
        // Fallback or defensive wrap for unexpected single value in multiple mode?
        (onChange as (v: string[]) => void)([val]);
      }
    } else {
      if (Array.isArray(val)) {
        console.warn('[Combobox] Received array value in single-select mode, using first element', val);
        (onChange as (v: string) => void)(val[0] ?? '');
      } else {
        (onChange as (v: string) => void)(val);
      }
    }
  };

  const normalize = (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return options;

    return options.filter((option) => {
      const normalizedOption = normalize(`${option.label} ${option.meta ?? ''}`);
      return normalizedOption.includes(normalizedQuery);
    });
  }, [options, query]);

  const resolvedFocusedIndex =
    focusedIndex >= 0 && focusedIndex < filteredOptions.length ? focusedIndex : -1;

  const showOptions = isOpen && filteredOptions.length > 0 && !disabled;
  const resolvedLeading = typeof leading === 'function' ? leading(selectedOption, selectedOptions) : leading;
  const hasValue = valueList.length > 0;

  const toggleValue = (optionValue: string, options?: { openAfterToggle?: boolean }) => {
    if (!isMultiple) return;

    const next = valueList.includes(optionValue)
      ? valueList.filter((item) => item !== optionValue)
      : [...valueList, optionValue];
    emitChange(next);
    setQuery('');
    setUserTyped(false);
    if (options?.openAfterToggle !== false) {
      setIsOpen(true);
    }
  };

  const addValue = (optionValue: string, options?: { openAfterToggle?: boolean }) => {
    if (!isMultiple) return;
    if (valueList.includes(optionValue)) return;

    emitChange([...valueList, optionValue]);
    setQuery('');
    setUserTyped(false);
    if (options?.openAfterToggle !== false) {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    // Only reset query from external value if not typing (not open)
    // or if the value fundamentally changed to something else valid
    if (!isOpen) {
      setQuery(resolvedDisplayValue);
      setFocusedIndex(-1);
    }
  }, [resolvedDisplayValue, isOpen]);

  return (
    <div className={cn('relative', className, disabled && 'opacity-50 pointer-events-none')}>
      <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
        {label}
      </label>
      <div className="relative mt-1">
        <div className="flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {resolvedLeading}
          </div>
          <input
            type="text"
            id={inputId}
            disabled={disabled}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              resolvedFocusedIndex >= 0 ? `${inputId}-option-${resolvedFocusedIndex}` : undefined
            }
            value={isOpen ? query : resolvedDisplayValue}
            onInput={(event) => {
              const nextValue = (event.target as HTMLInputElement).value;
              setQuery(nextValue);
              setUserTyped(true);
              setIsOpen(true);
              
              const normalizedQuery = normalize(nextValue);
              const nextFilteredOptions = normalizedQuery
                ? options.filter((option) => {
                    const normalizedOption = normalize(`${option.label} ${option.meta ?? ''}`);
                    return normalizedOption.includes(normalizedQuery);
                  })
                : options;
              setFocusedIndex(nextFilteredOptions.length > 0 ? 0 : -1);
            }}
            onFocus={() => {
                if (!disabled) {
                  if (query === resolvedDisplayValue) {
                    setQuery('');
                  }
                  setUserTyped(false);
                  setIsOpen(true);
                }
            }}
            onBlur={() => {
              setIsOpen(false);
              // Only emit if the user actually typed something or if query differs from display value and was intentional
              if (userTyped && query !== resolvedDisplayValue) {
                const trimmedQuery = query.trim();
                const exactMatch = options.find(o => o.label.trim() === trimmedQuery);
                const matchToEmit = exactMatch || (() => {
                  const lowerQuery = trimmedQuery.toLowerCase();
                  const caseInsensitiveMatches = options.filter(o => o.label.trim().toLowerCase() === lowerQuery);
                  if (caseInsensitiveMatches.length >= 1) {
                    return [...caseInsensitiveMatches].sort((a, b) => a.label.localeCompare(b.label))[0];
                  }
                  return null;
                })();

                if (isMultiple) {
                  if (matchToEmit) {
                    addValue(matchToEmit.value, { openAfterToggle: false });
                  } else if (trimmedQuery) {
                    addValue(trimmedQuery, { openAfterToggle: false });
                  }
                } else {
                  if (matchToEmit) {
                    emitChange(matchToEmit.value);
                  } else {
                    emitChange(trimmedQuery);
                  }
                }
              }
              setUserTyped(false);
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              if (!isOpen) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
                  event.preventDefault();
                  setIsOpen(true);
                  setFocusedIndex(0);
                }
                return;
              }

              if (filteredOptions.length === 0) {
                // If enter pressed with no options, strict close
                 if (event.key === 'Enter') {
                    event.preventDefault();
                    setIsOpen(false);
                 }
                setFocusedIndex(-1);
                return;
              }

              switch (event.key) {
                case 'ArrowDown':
                  event.preventDefault();
                  setFocusedIndex((prev) => {
                    const currentIndex =
                      prev >= 0 && prev < filteredOptions.length ? prev : 0;
                    return (currentIndex + 1) % filteredOptions.length;
                  });
                  break;
                case 'ArrowUp':
                  event.preventDefault();
                  setFocusedIndex((prev) => {
                    const currentIndex =
                      prev >= 0 && prev < filteredOptions.length ? prev : 0;
                    return currentIndex <= 0 ? filteredOptions.length - 1 : currentIndex - 1;
                  });
                  break;
                case 'Enter': {
                  event.preventDefault();
                  const option = filteredOptions[resolvedFocusedIndex];
                  if (option) {
                    if (isMultiple) {
                      toggleValue(option.value);
                      setFocusedIndex(0);
                    } else {
                      emitChange(option.value);
                      setQuery(displayValue?.(option) ?? option.label);
                      setUserTyped(false);
                      setIsOpen(false);
                    }
                  } else {
                    // No option selected from list, keep custom value
                    setIsOpen(false);
                  }
                  break;
                }
                case 'Escape':
                  event.preventDefault();
                  setIsOpen(false);
                  break;
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-md text-input-text placeholder:text-input-placeholder py-3 pl-12 pr-10 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 sm:text-sm disabled:bg-surface-glass/40 disabled:text-input-placeholder glass-input"
          />
          {hasValue ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (isMultiple) {
                  emitChange([]);
                } else {
                  emitChange('');
                }
                setQuery('');
                setIsOpen(false);
              }}
              aria-label={`Clear ${label}`}
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            <div className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 text-gray-400 pointer-events-none">
              <ChevronUpDownIcon className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
        </div>

        {showOptions && (
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable={isMultiple}
            tabIndex={-1}
            className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line-glass border-opacity-30 bg-[rgb(var(--surface-overlay)/0.94)] py-1 text-base shadow-glass backdrop-blur-xl focus:outline-none sm:text-sm"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
          >
            {filteredOptions.map((option, index) => {
              const isSelected = valueList.includes(option.value);
              const isFocused = index === resolvedFocusedIndex;
              const optionLead = optionLeading?.(option);
              const optionMetaContent = optionMeta?.(option) ?? option.meta;
              return (
                <button
                  key={option.value}
                  type="button"
                  id={`${inputId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (isMultiple) {
                      toggleValue(option.value);
                    } else {
                      emitChange(option.value);
                      setQuery(displayValue?.(option) ?? option.label);
                      setUserTyped(false);
                      setIsOpen(false);
                    }
                  }}
                  className={cn(
                    'group relative flex w-full items-center justify-between py-2 pl-3 pr-9 text-left transition-colors',
                    (isSelected || isFocused)
                      ? 'bg-[rgb(var(--accent-500)/0.18)] text-input-text'
                      : 'text-input-text hover:bg-[rgb(var(--surface-overlay)/0.78)]'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {optionLead && <span className="flex h-6 w-6 items-center justify-center">{optionLead}</span>}
                    <span className={cn('block truncate', isSelected && 'font-semibold')}>{option.label}</span>
                  </span>
                  {optionMetaContent && (
                    <span className="ml-3 max-w-[45%] truncate text-sm text-input-placeholder group-hover:text-input-text">
                      {optionMetaContent}
                    </span>
                  )}
                  {isSelected && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-accent-400">
                      <CheckIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
