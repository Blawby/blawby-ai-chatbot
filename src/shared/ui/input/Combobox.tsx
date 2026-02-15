import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { CheckIcon, ChevronUpDownIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';

export type ComboboxOption = {
  value: string;
  label: string;
  meta?: string;
  isCustom?: boolean; // true for free-text values not in the options list
};

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
  /**
   * When true, typing a value not in the options list shows an "Add [query]" row
   * and allows the free-text value to be emitted. Defaults to false.
   */
  allowCustomValues?: boolean;
  /** Placeholder shown inside the "Add new" row. Defaults to "Add" */
  addNewLabel?: string;
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
  disabled,
  allowCustomValues = false,
  addNewLabel = 'Add',
}: ComboboxProps) => {
  const isMultiple = multiple === true;

  const valueList = useMemo(() => {
    const raw = Array.isArray(value) ? value : value != null ? [value] : [];
    return raw.filter((v) => v != null && v !== '');
  }, [value]);

  // Build a merged option list that includes custom values already selected
  // so chips and display values resolve correctly even for free-text entries
  const mergedOptions = useMemo(() => {
    const knownValues = new Set(options.map((o) => o.value));
    const customEntries: ComboboxOption[] = valueList
      .filter((v) => !knownValues.has(v))
      .map((v) => ({ value: v, label: v, isCustom: true }));
    return [...options, ...customEntries];
  }, [options, valueList]);

  const selectedOptions = mergedOptions.filter((o) => valueList.includes(o.value));
  const selectedOption = selectedOptions[0];

  const resolvedDisplayValue =
    selectedOptions.length > 0
      ? selectedOptions.map((o) => displayValue?.(o) ?? o.label).join(', ')
      : isMultiple && Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'string'
      ? value
      : '';

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
      (onChange as (v: string[]) => void)(Array.isArray(val) ? val : [val]);
    } else {
      (onChange as (v: string) => void)(Array.isArray(val) ? (val[0] ?? '') : val);
    }
  };

  const normalize = (input: string) =>
    input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return options;
    return options.filter((o) => {
      const normalized = normalize(`${o.label} ${o.value} ${o.meta ?? ''}`);
      return normalized.includes(normalizedQuery);
    });
  }, [options, query]);

  // Whether to show the "Add [query]" row
  const trimmedQuery = query.trim();
  const queryMatchesExisting =
    trimmedQuery === '' ||
    mergedOptions.some((o) => {
      const normalizedQuery = trimmedQuery.toLowerCase();
      return (
        o.label.trim().toLowerCase() === normalizedQuery ||
        o.value.trim().toLowerCase() === normalizedQuery
      );
    });
  const queryAlreadySelected = valueList
    .map((v) => v.toLowerCase())
    .includes(trimmedQuery.toLowerCase());
  const showAddRow =
    allowCustomValues &&
    isOpen &&
    userTyped &&
    trimmedQuery.length > 0 &&
    !queryMatchesExisting &&
    !queryAlreadySelected;

  // Total rows in dropdown: filtered options + optional add row at top
  const totalRows = filteredOptions.length + (showAddRow ? 1 : 0);
  const resolvedFocusedIndex =
    focusedIndex >= 0 && focusedIndex < totalRows ? focusedIndex : -1;

  const showOptions = isOpen && (filteredOptions.length > 0 || showAddRow) && !disabled;
  const resolvedLeading =
    typeof leading === 'function' ? leading(selectedOption, selectedOptions) : leading;
  const hasValue = valueList.length > 0;

  const openDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  const commitValue = (val: string) => {
    if (isMultiple) {
      if (!valueList.includes(val)) {
        emitChange([...valueList, val]);
      }
      setQuery('');
      setUserTyped(false);
      openDropdown();
    } else {
      emitChange(val);
      const matchedOption = mergedOptions.find((o) => o.value === val);
      setQuery(matchedOption ? (displayValue?.(matchedOption) ?? matchedOption.label) : val);
      setUserTyped(false);
      closeDropdown();
    }
  };

  const toggleValue = (optionValue: string) => {
    if (!isMultiple) return;
    const next = valueList.includes(optionValue)
      ? valueList.filter((v) => v !== optionValue)
      : [...valueList, optionValue];
    emitChange(next);
    setQuery('');
    setUserTyped(false);
    openDropdown();
  };

  const removeValue = (optionValue: string) => {
    if (!isMultiple) return;
    emitChange(valueList.filter((v) => v !== optionValue));
  };

  // Removed Effect - sync handled in open/close handlers

  const handleKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        event.preventDefault();
        openDropdown();
        setFocusedIndex(0);
      }
      return;
    }

    if (totalRows === 0) {
      if (event.key === 'Enter') {
        event.preventDefault();
        const matchedOption =
          queryMatchesExisting && trimmedQuery !== ''
            ? mergedOptions.find(
                (o) =>
                  o.label.trim().toLowerCase() === trimmedQuery.toLowerCase() ||
                  o.value.trim().toLowerCase() === trimmedQuery.toLowerCase()
              )
            : null;

        if (matchedOption) {
          commitValue(matchedOption.value);
        } else if (allowCustomValues && trimmedQuery) {
          commitValue(trimmedQuery);
        } else {
          closeDropdown();
        }
      }
      setFocusedIndex(-1);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => {
          const cur = prev >= 0 && prev < totalRows ? prev : -1;
          return (cur + 1) % totalRows;
        });
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => {
          const cur = prev >= 0 && prev < totalRows ? prev : 0;
          return cur <= 0 ? totalRows - 1 : cur - 1;
        });
        break;
      case 'Enter': {
        event.preventDefault();
        if (resolvedFocusedIndex === -1) {
          // Nothing focused — if allowCustomValues, commit the typed query
          if (allowCustomValues && trimmedQuery && !queryMatchesExisting) {
            commitValue(trimmedQuery);
          } else {
            closeDropdown();
          }
          break;
        }
        // Index 0 is the "Add" row when showAddRow is true
        if (showAddRow && resolvedFocusedIndex === 0) {
          commitValue(trimmedQuery);
          break;
        }
        const optionIndex = showAddRow ? resolvedFocusedIndex - 1 : resolvedFocusedIndex;
        const option = filteredOptions[optionIndex];
        if (option) {
          if (isMultiple) {
            toggleValue(option.value);
            setFocusedIndex(showAddRow ? 1 : 0);
          } else {
            commitValue(option.value);
          }
        }
        break;
      }
      case 'Backspace': {
        // In multiple mode, if query is empty, remove the last chip
        if (isMultiple && query === '' && valueList.length > 0) {
          event.preventDefault();
          emitChange(valueList.slice(0, -1));
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        closeDropdown();
        break;
    }
  };

  return (
    <div className={cn('relative', className, disabled && 'opacity-50 pointer-events-none')}>
      <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
        {label}
      </label>

      <div className="relative mt-1">
        {/* Multiple mode: chips inside the input wrapper */}
        {isMultiple && selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1">
            {selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
                  opt.isCustom
                    ? 'bg-[rgb(var(--accent-500)/0.12)] text-accent-300 ring-1 ring-inset ring-accent-500/30'
                    : 'bg-surface-glass text-input-text ring-1 ring-inset ring-line-glass/40'
                )}
              >
                {opt.label}
                {opt.isCustom && (
                  <span className="text-accent-400/70 text-[10px] leading-none">custom</span>
                )}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => removeValue(opt.value)}
                  className="ml-0.5 rounded hover:text-red-400 transition-colors"
                  aria-label={`Remove ${opt.label}`}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative flex items-center">
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
            value={isOpen ? query : (isMultiple ? '' : resolvedDisplayValue)}
            placeholder={isMultiple && selectedOptions.length > 0 ? 'Add another…' : placeholder}
            onInput={(event) => {
              const nextValue = (event.target as HTMLInputElement).value;
              setQuery(nextValue);
              setUserTyped(true);
              openDropdown();
              setFocusedIndex(0);
            }}
            onFocus={() => {
              if (!disabled) {
                if (!isMultiple) {
                  setQuery('');
                }
                setUserTyped(false);
                openDropdown();
              }
            }}
            onBlur={() => {
              closeDropdown();

              if (!userTyped) return;

              const trimmed = query.trim();
              if (!trimmed) return;

              const exactMatch = mergedOptions.find(
                (o) =>
                  o.label.trim().toLowerCase() === trimmed.toLowerCase() ||
                  o.value.trim().toLowerCase() === trimmed.toLowerCase()
              );

              if (isMultiple) {
                const valToAdd = exactMatch ? exactMatch.value : allowCustomValues ? trimmed : null;
                if (valToAdd && !valueList.includes(valToAdd)) {
                  emitChange([...valueList, valToAdd]);
                }
              } else {
                if (exactMatch) {
                  emitChange(exactMatch.value);
                } else if (allowCustomValues && trimmed) {
                  emitChange(trimmed);
                }
                // If no match and no allowCustomValues, the input implicitly reverts
                // to showing resolvedDisplayValue when closed via closeDropdown().
              }

              setUserTyped(false);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full rounded-md text-input-text placeholder:text-input-placeholder py-3 pl-12 pr-10',
              'focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 sm:text-sm',
              'disabled:bg-surface-glass/40 disabled:text-input-placeholder glass-input',
              isMultiple && selectedOptions.length > 0 && 'pt-1.5'
            )}
          />

          {/* Clear button (single) or chevron */}
          {!isMultiple && hasValue ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                emitChange('');
                setQuery('');
                closeDropdown();
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

      {/* Hint text when allowCustomValues */}
      {allowCustomValues && !isOpen && (
        <p className="mt-1 text-xs text-input-placeholder pl-1">
          Select an existing option or type to add your own.
        </p>
      )}

      {showOptions && (
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable={isMultiple}
            tabIndex={-1}
            className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line-glass border-opacity-30 bg-[rgb(var(--surface-overlay)/0.94)] py-1 text-base shadow-glass backdrop-blur-xl focus:outline-none sm:text-sm"
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* "Add [query]" row — always at top when shown */}
            {showAddRow && (
              <button
                type="button"
                id={`${inputId}-option-0`}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitValue(trimmedQuery)}
                className={cn(
                  'group relative flex w-full items-center gap-2.5 py-2 pl-3 pr-9 text-left transition-colors',
                  resolvedFocusedIndex === 0
                    ? 'bg-[rgb(var(--accent-500)/0.18)] text-input-text'
                    : 'text-input-text hover:bg-[rgb(var(--surface-overlay)/0.78)]'
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-500/20 text-accent-400 flex-shrink-0">
                  <PlusIcon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm">
                  {addNewLabel}{' '}
                  <span className="font-semibold text-accent-300">"{trimmedQuery}"</span>
                </span>
              </button>
            )}

            {/* Divider between add row and existing options */}
            {showAddRow && filteredOptions.length > 0 && (
              <div className="my-1 border-t border-line-glass/20" />
            )}

            {filteredOptions.map((option, index) => {
              // Offset index by 1 if the add row is showing
              const rowIndex = showAddRow ? index + 1 : index;
              const isSelected = valueList.includes(option.value);
              const isFocused = rowIndex === resolvedFocusedIndex;
              const optionLead = optionLeading?.(option);
              const optionMetaContent = optionMeta?.(option) ?? option.meta;

              return (
                <button
                  key={option.value}
                  type="button"
                  id={`${inputId}-option-${rowIndex}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (isMultiple) {
                      toggleValue(option.value);
                    } else {
                      commitValue(option.value);
                    }
                  }}
                  className={cn(
                    'group relative flex w-full items-center justify-between py-2 pl-3 pr-9 text-left transition-colors',
                    isSelected || isFocused
                      ? 'bg-[rgb(var(--accent-500)/0.18)] text-input-text'
                      : 'text-input-text hover:bg-[rgb(var(--surface-overlay)/0.78)]'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {optionLead && (
                      <span className="flex h-6 w-6 items-center justify-center">{optionLead}</span>
                    )}
                    <span className={cn('block truncate', isSelected && 'font-semibold')}>
                      {option.label}
                    </span>
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

            {/* Empty state when nothing matches and allowCustomValues is off */}
            {filteredOptions.length === 0 && !showAddRow && (
              <div className="py-3 px-4 text-sm text-input-placeholder text-center">
                No options found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
