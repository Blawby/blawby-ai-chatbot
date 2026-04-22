/**
 * Combobox — unified select / combobox primitive
 *
 * Replaces both Select.tsx and Combobox.tsx.
 *
 * Modes:
 *   searchable={false}  → plain dropdown (replaces Select)
 *   searchable={true}   → filterable combobox (default)
 *   multiple={true}     → multi-select with chips
 *   allowCustomValues   → free-text "Add …" row
 *
 * All visual styles use design-system tokens from index.css.
 */

import { useMemo, useState, useRef, useEffect, useCallback } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComboboxOption = {
  value: string;
  label: string;
  meta?: string;
  description?: string;
  icon?: ComponentChildren;
  isCustom?: boolean;
  disabled?: boolean;
};

type BaseProps = {
  label?: string;
  placeholder?: string;
  options: ComboboxOption[];
  /** Icon/element shown on the left of the trigger */
  leading?: ComponentChildren | ((selected?: ComboboxOption, selectedMany?: ComboboxOption[]) => ComponentChildren);
  /** Icon/element shown on the left for each dropdown option */
  optionLeading?: ComponentChildren | ((option: ComboboxOption) => ComponentChildren);
  /** Optional custom right-side meta content for each dropdown option */
  optionMeta?: (option: ComboboxOption) => ComponentChildren;
  footer?: ComponentChildren;
  className?: string;
  disabled?: boolean;
  /** Show clear icon for single-select values. Default: true */
  clearable?: boolean;
  /** Show search input inside dropdown. Default: true */
  searchable?: boolean;
  /** Allow typing a value not in the list. Default: false */
  allowCustomValues?: boolean;
  /** Label for the "Add …" row. Default: "Add" */
  addNewLabel?: string;
  /** Hide the default helper text shown for free-text comboboxes. */
  hideCustomHint?: boolean;
  /** Dropdown direction. Default: "down" */
  direction?: 'up' | 'down';
  description?: string;
  'aria-labelledby'?: string;
  id?: string;
  autoFocus?: boolean;
  defaultOpen?: boolean;
  /** Hide the trigger button. Useful when the dropdown is auto-opened by an external toggle. */
  hideTrigger?: boolean;
};

export type ComboboxProps =
  | (BaseProps & { multiple?: false; value: string; onChange: (v: string) => void })
  | (BaseProps & { multiple: true; value: string[]; onChange: (v: string[]) => void });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const uid = () => Math.random().toString(36).slice(2, 9);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Chip({
  label,
  isCustom,
  onRemove,
  compact = false,
  showCustomBadge = true,
}: {
  label: string;
  isCustom?: boolean;
  onRemove: () => void;
  compact?: boolean;
  showCustomBadge?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-xl border text-xs font-medium',
        compact ? 'min-h-8 px-3 py-1 text-sm' : 'px-2 py-0.5',
        isCustom
          ? 'border-accent-500/25 bg-accent-500/12 text-accent-utility'
          : 'border-line-utility/10 bg-surface-utility/10 text-input-text'
      )}
    >
      <span className="truncate">{label}</span>
      {isCustom && showCustomBadge && (
        <span className="text-accent-utility/60 text-[10px] leading-none">custom</span>
      )}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 rounded text-input-placeholder transition-colors hover:text-input-text"
        aria-label={`Remove ${label}`}
      >
        <Icon icon={XMarkIcon} className={cn(compact ? 'h-4 w-4' : 'h-3 w-3')}  />
      </button>
    </span>
  );
}

function DropdownOption({
  option,
  isSelected,
  isFocused,
  onSelect,
  id,
  optionLeading,
  optionMeta,
}: {
  option: ComboboxOption;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  id: string;
  optionLeading?: ComponentChildren | ((option: ComboboxOption) => ComponentChildren);
  optionMeta?: (option: ComboboxOption) => ComponentChildren;
  footer?: ComponentChildren;
}) {
  const resolvedOptionLeading =
    typeof optionLeading === 'function' ? optionLeading(option) : optionLeading ?? option.icon;
  const resolvedOptionMeta = optionMeta ? optionMeta(option) : option.meta;

  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      disabled={option.disabled}
      className={cn(
        'group relative flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-all',
        option.disabled && 'cursor-not-allowed opacity-45',
        isSelected || isFocused
          ? 'bg-accent-500/15 text-[rgb(var(--accent-foreground))]'
          : 'text-input-text hover:bg-surface-utility/10 dark:hover:bg-surface-utility/20',
        option.disabled && 'hover:bg-transparent dark:hover:bg-transparent'
      )}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        {resolvedOptionLeading && (
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center text-input-placeholder group-hover:text-input-text">
            {resolvedOptionLeading}
          </span>
        )}
        <span className="min-w-0">
          <span className={cn('block truncate', isSelected && 'font-medium')}>
            {option.label}
          </span>
          {option.description ? (
            <span className="mt-0.5 block truncate text-xs text-input-placeholder">
              {option.description}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-2">
        {resolvedOptionMeta && (
          <span className="text-xs text-input-placeholder">{resolvedOptionMeta}</span>
        )}
        {isSelected && (
          <Icon icon={CheckIcon} className="h-4 w-4 text-accent-400" aria-hidden="true"  />
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Combobox({
  label,
  placeholder = 'Select an option',
  value,
  options,
  leading,
  optionLeading,
  optionMeta,
  footer,
  onChange,
  multiple,
  className,
  disabled = false,
  clearable = true,
  searchable = true,
  allowCustomValues = false,
  addNewLabel = 'Add',
  hideCustomHint = false,
  direction = 'down',
  description,
  'aria-labelledby': ariaLabelledBy,
  id,
  autoFocus,
  defaultOpen,
  hideTrigger = false,
}: ComboboxProps) {
  const isMultiple = multiple === true;
  const internalId = useMemo(() => `cbx-${uid()}`, []);
  const inputId = id || internalId;
  const listboxId = `${inputId}-listbox`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(defaultOpen === true);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    if (autoFocus && !disabled) {
      open();
    }
  }, [autoFocus, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const valueList = useMemo<string[]>(() => {
    if (isMultiple) return (value as string[]).filter(Boolean);
    return value ? [value as string] : [];
  }, [value, isMultiple]);

  // Merge in any custom (free-text) values already selected so chips resolve
  const mergedOptions = useMemo(() => {
    const known = new Set(options.map((o) => o.value));
    const custom: ComboboxOption[] = valueList
      .filter((v) => !known.has(v))
      .map((v) => ({ value: v, label: v, isCustom: true }));
    return [...options, ...custom];
  }, [options, valueList]);

  const selectedOptions = mergedOptions.filter((o) => valueList.includes(o.value));
  const selectedOption = selectedOptions[0];

  const displayText = useMemo(() => {
    if (selectedOptions.length === 0) return '';
    return selectedOptions.map((o) => o.label).join(', ');
  }, [selectedOptions]);

  const filteredOptions = useMemo(() => {
    const q = normalize(query);
    if (!q || !searchable) return options;
    return options.filter((o) =>
      normalize(`${o.label} ${o.value} ${o.meta ?? ''}`).includes(q)
    );
  }, [options, query, searchable]);

  const trimmedQuery = query.trim();
  const queryMatchesExisting = mergedOptions.some(
    (o) =>
      o.label.trim().toLowerCase() === trimmedQuery.toLowerCase() ||
      o.value.trim().toLowerCase() === trimmedQuery.toLowerCase()
  );
  const queryAlreadySelected = valueList
    .map((v) => v.toLowerCase())
    .includes(trimmedQuery.toLowerCase());
  const showAddRow =
    allowCustomValues &&
    isOpen &&
    trimmedQuery.length > 0 &&
    !queryAlreadySelected &&
    (!queryMatchesExisting || filteredOptions.length === 0);

  const totalRows = filteredOptions.length + (showAddRow ? 1 : 0);
  const clampedFocus = focusedIndex >= 0 && focusedIndex < totalRows ? focusedIndex : -1;

  const resolvedLeading =
    typeof leading === 'function' ? leading(selectedOption, selectedOptions) : leading;

  // ------------------------------------------------------------------
  // Open / close
  // ------------------------------------------------------------------

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    if (searchable) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [disabled, searchable]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!isOpen || !containerRef.current) return;

      if (!containerRef.current.contains(e.target as Node)) {
        const isInteractive = (e.target as Element).closest('button, a, input, select, textarea, [tabindex]');
        if (isInteractive) {
          setIsOpen(false);
          setQuery('');
          setFocusedIndex(-1);
        } else {
          close();
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close]);

  // ------------------------------------------------------------------
  // Value helpers
  // ------------------------------------------------------------------

  const emit = useCallback(
    (next: string | string[]) => {
      if (isMultiple) {
        (onChange as (v: string[]) => void)(Array.isArray(next) ? next : [next]);
      } else {
        (onChange as (v: string) => void)(Array.isArray(next) ? (next[0] ?? '') : next);
      }
    },
    [isMultiple, onChange]
  );

  const commit = useCallback(
    (val: string) => {
      if (isMultiple) {
        if (!valueList.includes(val)) emit([...valueList, val]);
        setQuery('');
        setFocusedIndex(0);
        inputRef.current?.focus();
      } else {
        emit(val);
        close();
      }
    },
    [isMultiple, valueList, emit, close]
  );

  const toggle = useCallback(
    (val: string) => {
      const next = valueList.includes(val)
        ? valueList.filter((v) => v !== val)
        : [...valueList, val];
      emit(next);
      setQuery('');
      inputRef.current?.focus();
    },
    [valueList, emit]
  );

  const remove = useCallback(
    (val: string) => emit(valueList.filter((v) => v !== val)),
    [valueList, emit]
  );

  const clear = useCallback(() => {
    emit(isMultiple ? [] : '');
    setQuery('');
    close();
  }, [isMultiple, emit, close]);

  // ------------------------------------------------------------------
  // Keyboard navigation
  // ------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;

      if (!isOpen) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          open();
          setFocusedIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((p) => (totalRows === 0 ? -1 : (p + 1) % totalRows));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((p) =>
            totalRows === 0 ? -1 : p <= 0 ? totalRows - 1 : p - 1
          );
          break;
        case 'Enter': {
          e.preventDefault();
          if (clampedFocus === -1) {
            if (allowCustomValues && trimmedQuery && !queryMatchesExisting) {
              commit(trimmedQuery);
            } else {
              close();
            }
            break;
          }
          if (showAddRow && clampedFocus === 0) {
            commit(trimmedQuery);
            break;
          }
          const optIdx = showAddRow ? clampedFocus - 1 : clampedFocus;
          const opt = filteredOptions[optIdx];
          if (opt) {
            if (isMultiple) {
              toggle(opt.value);
            } else {
              commit(opt.value);
            }
          }
          break;
        }
        case 'Backspace':
          if (isMultiple && query === '' && valueList.length > 0) {
            e.preventDefault();
            emit(valueList.slice(0, -1));
          }
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'Tab':
          close();
          break;
      }
    },
    [
      disabled, isOpen, open, close, totalRows, clampedFocus, showAddRow,
      allowCustomValues, trimmedQuery, queryMatchesExisting, commit, toggle,
      filteredOptions, isMultiple, query, valueList, emit,
    ]
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const hasValue = valueList.length > 0;

  useEffect(() => {
    if (!isOpen || clampedFocus < 0) return;
    const element = typeof document !== 'undefined'
      ? document.getElementById(`${inputId}-option-${clampedFocus}`)
      : null;
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [clampedFocus, inputId, isOpen]);

  const triggerContent = (
    <>
      {resolvedLeading && (
        <span
          className={cn(
            'pointer-events-none flex-shrink-0 text-input-placeholder',
            isMultiple ? 'pt-1' : ''
          )}
        >
          {resolvedLeading}
        </span>
      )}

      <span className="min-w-0 flex-1 text-left">
        {isMultiple && hasValue ? (
          <span className="flex flex-wrap gap-2">
            {selectedOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                isCustom={option.isCustom}
                onRemove={() => remove(option.value)}
                compact
                showCustomBadge={false}
              />
            ))}
          </span>
        ) : (
          <span
            className={cn(
              'block truncate text-sm',
              !hasValue && 'text-input-placeholder'
            )}
          >
            {hasValue ? displayText : placeholder}
          </span>
        )}
      </span>

      {/* Clear or chevron */}
      {hasValue && !isMultiple && clearable ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); clear(); }}
          className="flex-shrink-0 text-input-placeholder hover:text-input-text transition-colors"
          aria-label="Clear selection"
        >
          <Icon icon={XMarkIcon} className="h-4 w-4"  />
        </button>
      ) : (
        <span className="flex-shrink-0 text-input-placeholder pointer-events-none">
          {searchable
            ? <Icon icon={ChevronUpDownIcon} className="h-4 w-4"  />
            : <Icon icon={ChevronDownIcon} className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}  />
          }
        </span>
      )}
    </>
  );

  return (
    <div ref={containerRef} className={cn('relative w-full', className, disabled && 'opacity-50 pointer-events-none')}>
      {/* Label */}
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-input-text">
          {label}
        </label>
      )}

      {/* Trigger */}
      {!hideTrigger ? (
        <div
          ref={triggerRef}
          id={inputId}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-labelledby={ariaLabelledBy}
          aria-activedescendant={
            !searchable && isOpen && clampedFocus >= 0
              ? `${inputId}-option-${clampedFocus}`
              : undefined
          }
          onClick={() => (isOpen ? close() : open())}
          onKeyDown={handleKeyDown}
          className={cn(
            'glass-input relative flex w-full gap-2 rounded-xl px-3 py-2.5 transition-all duration-200',
            isOpen && 'isOpen',
            isMultiple ? 'min-h-[3.5rem] items-start' : 'items-center',
            !disabled && 'cursor-pointer'
          )}
        >
          {triggerContent}
        </div>
      ) : (
        <div ref={triggerRef} tabIndex={-1} className="h-0 w-0 overflow-hidden pointer-events-none opacity-0 absolute" />
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable={isMultiple}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            'z-50 w-full overflow-hidden rounded-xl absolute',
            'bg-surface-overlay shadow-glass border border-line-glass/20',
            hideTrigger ? 'top-0 mt-1' : (direction === 'up' ? 'bottom-full mb-1 top-auto' : 'top-full mt-1')
          )}
        >
          {/* Search input */}
          {searchable && (
            <div className="border-b border-line-glass/10 px-2 py-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                placeholder={isMultiple ? 'Filter or add…' : 'Search…'}
                onInput={(e) => {
                  setQuery((e.target as HTMLInputElement).value);
                  setFocusedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className={cn(
                  'w-full rounded-xl bg-surface-utility/10 px-3 py-1.5 text-sm text-input-text',
                  'placeholder:text-input-placeholder/60',
                  'focus:outline-none focus:ring-2 ring-inset focus:ring-accent-500/30'
                )}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={
                  clampedFocus >= 0 ? `${inputId}-option-${clampedFocus}` : undefined
                }
              />
            </div>
          )}

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {/* Add custom value row */}
            {showAddRow && (
              <button
                type="button"
                id={`${inputId}-option-0`}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(trimmedQuery)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  clampedFocus === 0
                    ? 'bg-accent-500/15 text-[rgb(var(--accent-foreground))]'
                    : 'text-input-text hover:bg-surface-utility/10 focus:bg-surface-utility/20'
                )}
              >
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-accent-500/20 text-accent-400">
                  <Icon icon={PlusIcon} className="h-3.5 w-3.5"  />
                </span>
                <span>
                  {addNewLabel}{' '}
                  <span className="font-semibold text-accent-300">&quot;{trimmedQuery}&quot;</span>
                </span>
              </button>
            )}

            {showAddRow && filteredOptions.length > 0 && (
              <div className="my-1 border-t border-black/5 dark:border-white/[0.06]" />
            )}

            {filteredOptions.map((option, index) => {
              const rowIndex = showAddRow ? index + 1 : index;
              return (
                <DropdownOption
                  key={option.value}
                  id={`${inputId}-option-${rowIndex}`}
                  option={option}
                  isSelected={valueList.includes(option.value)}
                  isFocused={rowIndex === clampedFocus}
                  optionLeading={optionLeading}
                  optionMeta={optionMeta}
                  onSelect={() =>
                    option.disabled
                      ? undefined
                      : isMultiple ? toggle(option.value) : commit(option.value)
                  }
                />
              );
            })}

            {filteredOptions.length === 0 && !showAddRow && (
              <p className="px-4 py-3 text-center text-sm text-input-placeholder">
                No options found.
              </p>
            )}
          </div>

          {footer ? (
            <div className="border-t border-line-glass/10 px-2 py-2">
              {footer}
            </div>
          ) : null}
        </div>
      )}

      {/* Description / hint */}
      {description && (
        <p className="mt-1 pl-1 text-xs text-input-placeholder">{description}</p>
      )}
      {allowCustomValues && !hideCustomHint && !isOpen && !description && (
        <p className="mt-1 pl-1 text-xs text-input-placeholder">
          Select an option or type to add your own.
        </p>
      )}
    </div>
  );
}
