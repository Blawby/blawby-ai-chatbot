/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { CheckIcon, ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';

export type ComboboxOption = { value: string; label: string; meta?: string };

export interface ComboboxProps {
  label: string;
  placeholder: string;
  value: string;
  options: ComboboxOption[];
  leading: ComponentChildren | ((selectedOption?: ComboboxOption) => ComponentChildren);
  onChange: (value: string) => void;
  className?: string;
  displayValue?: (option?: ComboboxOption) => string;
  optionLeading?: (option: ComboboxOption) => ComponentChildren;
  optionMeta?: (option: ComboboxOption) => ComponentChildren;
}

export const Combobox = ({
  label,
  placeholder,
  value,
  options,
  leading,
  onChange,
  className,
  displayValue,
  optionLeading,
  optionMeta
}: ComboboxProps) => {
  const selectedOption = options.find((option) => option.value === value);
  const resolvedDisplayValue = displayValue?.(selectedOption) ?? selectedOption?.label ?? '';
  const [query, setQuery] = useState(resolvedDisplayValue);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputId = useMemo(
    () => `combobox-${label.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
    [label]
  );
  const listboxId = `${inputId}-listbox`;

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

  const showOptions = isOpen && filteredOptions.length > 0;
  const resolvedLeading = typeof leading === 'function' ? leading(selectedOption) : leading;

  useEffect(() => {
    if (!isOpen) {
      setQuery(resolvedDisplayValue);
      setFocusedIndex(-1);
    }
  }, [resolvedDisplayValue, isOpen]);

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
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
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              resolvedFocusedIndex >= 0 ? `${inputId}-option-${resolvedFocusedIndex}` : undefined
            }
            value={query}
            onInput={(event) => {
              const nextValue = (event.target as HTMLInputElement).value;
              const normalizedQuery = normalize(nextValue);
              const nextFilteredOptions = normalizedQuery
                ? options.filter((option) => {
                    const normalizedOption = normalize(`${option.label} ${option.meta ?? ''}`);
                    return normalizedOption.includes(normalizedQuery);
                  })
                : options;
              setQuery(nextValue);
              setIsOpen(true);
              setFocusedIndex(nextFilteredOptions.length > 0 ? 0 : -1);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
            onKeyDown={(event) => {
              if (!isOpen) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
                  event.preventDefault();
                  setIsOpen(true);
                  setFocusedIndex(0);
                }
                return;
              }

              if (filteredOptions.length === 0) {
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
                    onChange(option.value);
                    setQuery(displayValue?.(option) ?? option.label);
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
            className="w-full rounded-md border border-gray-300 dark:border-white/10 bg-white dark:bg-dark-input-bg py-3 pl-12 pr-10 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 sm:text-sm"
          />
          {value ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange('');
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
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-dark-card-bg py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm"
          >
            {filteredOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isFocused = index === resolvedFocusedIndex;
              const optionLead = optionLeading?.(option);
              const optionMetaContent = optionMeta?.(option) ?? option.meta;
              return (
                <li
                  key={option.value}
                  id={`${inputId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setQuery(displayValue?.(option) ?? option.label);
                    setIsOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onChange(option.value);
                      setQuery(displayValue?.(option) ?? option.label);
                      setIsOpen(false);
                    }
                  }}
                  className={cn(
                    'group relative flex w-full items-center justify-between py-2 pl-3 pr-9 text-left transition-colors',
                    (isSelected || isFocused)
                      ? 'bg-accent-50 text-gray-900 dark:bg-accent-500/10 dark:text-white'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-accent-50/70 dark:hover:bg-white/5'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {optionLead && <span className="flex h-6 w-6 items-center justify-center">{optionLead}</span>}
                    <span className={cn('block truncate', isSelected && 'font-semibold')}>{option.label}</span>
                  </span>
                  {optionMetaContent && (
                    <span className="ml-3 max-w-[45%] truncate text-sm text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200">
                      {optionMetaContent}
                    </span>
                  )}
                  {isSelected && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-accent-600 dark:text-accent-300">
                      <CheckIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
