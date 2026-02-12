/**
 * TagInput - Molecule Component
 * 
 * Multi-select input with freeform entry, tag display, and optional suggestions.
 * Follows ARIA combobox pattern for accessibility.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'preact/hooks';
import { forwardRef } from 'preact/compat';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';
import { useUniqueId } from '@/shared/hooks/useUniqueId';
import { Tag } from './atoms/Tag';

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  label?: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  maxTags?: number;
  maxTagLength?: number;
  allowDuplicates?: boolean;
  normalizeTag?: (tag: string) => string;
  delimiters?: string[];
  onValidate?: (tag: string) => boolean | string;
  asyncSuggestions?: (query: string) => Promise<string[]>;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  className?: string;
  // i18n support
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  // ARIA
  id?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(({
  value = [],
  onChange,
  suggestions = [],
  placeholder = 'Type and press Enter',
  label,
  description,
  error,
  disabled = false,
  maxTags,
  maxTagLength,
  allowDuplicates = false,
  normalizeTag,
  delimiters = [',', 'Enter'],
  onValidate,
  asyncSuggestions,
  size = 'md',
  variant = 'default',
  className = '',
  labelKey,
  descriptionKey,
  placeholderKey,
  errorKey,
  namespace = 'common',
  id,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
  ...restProps
}, ref) => {
  const { t } = useTranslation(namespace);
  const generatedId = useUniqueId('tag-input');
  const inputId = id || generatedId;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState(-1);
  const [isComposing, setIsComposing] = useState(false);
  const [asyncSuggestionsList, setAsyncSuggestionsList] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const displayLabel = labelKey ? t(labelKey) : label;
  const displayDescription = descriptionKey ? t(descriptionKey) : description;
  const displayPlaceholder = placeholderKey ? t(placeholderKey) : placeholder;
  const displayError = errorKey ? t(errorKey) : error;

  // Combine static and async suggestions
  const allSuggestions = useMemo(() => {
    if (asyncSuggestionsList.length > 0) {
      return [...suggestions, ...asyncSuggestionsList];
    }
    return suggestions;
  }, [suggestions, asyncSuggestionsList]);

  // Helper function to compute filtered suggestions synchronously
  const computeFilteredSuggestions = useCallback((query: string, suggestionsList: string[], currentTags: string[]) => {
    if (!query.trim()) return [];
    
    const lowerInput = query.toLowerCase();
    return suggestionsList
      .filter(suggestion => {
        const lowerSuggestion = suggestion.toLowerCase();
        // Don't show if already in tags (unless duplicates allowed)
        if (!allowDuplicates && currentTags.includes(suggestion)) return false;
        // Filter by input match
        return lowerSuggestion.includes(lowerInput);
      })
      .slice(0, 10); // Limit to 10 suggestions
  }, [allowDuplicates]);

  // Filter suggestions based on input and existing tags
  const filteredSuggestions = useMemo(() => {
    return computeFilteredSuggestions(inputValue, allSuggestions, value);
  }, [inputValue, allSuggestions, value, computeFilteredSuggestions]);

  // Precompute delimiter regex for paste handling (support multi-character tokens)
  const delimiterRegex = useMemo<RegExp | null>(() => {
    const tokens = delimiters
      .filter(d => d !== 'Enter') // Enter is not in paste text
      .map(d => (d === 'Tab' ? '\t' : d))
      .map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (tokens.length === 0) {
      return null;
    }
    return new RegExp(`(?:${tokens.join('|')})`);
  }, [delimiters]);

  // Load async suggestions
  useEffect(() => {
    if (!asyncSuggestions || !inputValue.trim() || isComposing) {
      setAsyncSuggestionsList([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const results = await asyncSuggestions(inputValue);
        setAsyncSuggestionsList(results || []);
      } catch (error) {
        console.error('Error loading suggestions:', error);
        setAsyncSuggestionsList([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeoutId);
  }, [inputValue, asyncSuggestions, isComposing]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setFocusedSuggestionIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Announce tag changes to screen readers
  const announceTagChange = useCallback((message: string) => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = message;
      // Clear after announcement
      setTimeout(() => {
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = '';
        }
      }, 1000);
    }
  }, []);

  const normalizeTagValue = useCallback((tag: string): string => {
    let normalized = tag.trim();
    if (normalizeTag) {
      normalized = normalizeTag(normalized);
    }
    return normalized;
  }, [normalizeTag]);

  const validateTag = useCallback((tag: string): { valid: boolean; error?: string } => {
    if (!tag) {
      return { valid: false };
    }

    if (maxTagLength && tag.length > maxTagLength) {
      return { valid: false, error: `Tag must be ${maxTagLength} characters or less` };
    }

    if (onValidate) {
      const result = onValidate(tag);
      if (result === false) {
        return { valid: false, error: 'Invalid tag' };
      }
      if (typeof result === 'string') {
        return { valid: false, error: result };
      }
    }

    return { valid: true };
  }, [maxTagLength, onValidate]);

  const addTag = useCallback((tag: string) => {
    const normalized = normalizeTagValue(tag);
    if (!normalized) return;

    // Check max tags
    if (maxTags && value.length >= maxTags) {
      announceTagChange(`Maximum of ${maxTags} tags reached`);
      return;
    }

    // Check duplicates
    if (!allowDuplicates && value.includes(normalized)) {
      announceTagChange(`${normalized} is already added`);
      return;
    }

    // Validate tag
    const validation = validateTag(normalized);
    if (!validation.valid) {
      if (validation.error) {
        announceTagChange(validation.error);
      }
      return;
    }

    onChange([...value, normalized]);
    announceTagChange(`Added ${normalized}`);
    setInputValue('');
    setIsDropdownOpen(false);
    setFocusedSuggestionIndex(-1);
  }, [value, onChange, maxTags, allowDuplicates, normalizeTagValue, validateTag, announceTagChange]);

  const removeTag = useCallback((index: number) => {
    const removedTag = value[index];
    onChange(value.filter((_, i) => i !== index));
    announceTagChange(`Removed ${removedTag}`);
    // Refocus input after removal
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value, onChange, announceTagChange]);

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    
    // Compute filtered suggestions synchronously from newValue
    const computedFiltered = computeFilteredSuggestions(newValue, allSuggestions, value);
    const hasSuggestions = computedFiltered.length > 0 || isLoadingSuggestions;
    setIsDropdownOpen(newValue.trim().length > 0 && hasSuggestions);
    setFocusedSuggestionIndex(-1);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const pastedText = e.clipboardData?.getData('text') || '';
    if (!pastedText) return;

    // If any configured delimiter is present, handle splitting
    if (delimiterRegex?.test(pastedText)) {
      e.preventDefault();
      
      // Split using precomputed regex
      const rawTags = pastedText
        .split(delimiterRegex)
        .map(tag => normalizeTagValue(tag))
        .filter(tag => tag.length > 0);

      // Snapshot current value to avoid stale closure
      const currentValueSnapshot = [...value];
      
      // Collect all valid tags from pasted text
      const newTags: string[] = [];
      
      for (const tag of rawTags) {
        // Check max tags limit
        if (maxTags && currentValueSnapshot.length + newTags.length >= maxTags) break;
        
        // Skip duplicates if not allowed
        if (!allowDuplicates && (currentValueSnapshot.includes(tag) || newTags.includes(tag))) continue;
        
        // Validate tag
        const validation = validateTag(tag);
        if (validation.valid) {
          newTags.push(tag);
        }
      }

      // Call onChange once with merged array
      if (newTags.length > 0) {
        onChange([...currentValueSnapshot, ...newTags]);
        announceTagChange(`Added ${newTags.length} tag${newTags.length !== 1 ? 's' : ''}`);
      }

      setInputValue('');
    }
  }, [delimiterRegex, normalizeTagValue, value, onChange, maxTags, allowDuplicates, validateTag, announceTagChange]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled || isComposing) return;

    // Handle dropdown navigation
    if (isDropdownOpen && filteredSuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedSuggestionIndex(prev =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0
          );
          return;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedSuggestionIndex(prev =>
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1
          );
          return;
        case 'Enter':
          e.preventDefault();
          if (focusedSuggestionIndex >= 0) {
            addTag(filteredSuggestions[focusedSuggestionIndex]);
          } else if (inputValue.trim()) {
            addTag(inputValue);
          }
          return;
        case 'Escape':
          e.preventDefault();
          setIsDropdownOpen(false);
          setFocusedSuggestionIndex(-1);
          return;
      }
    }

    // Handle tag removal with Backspace
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
      return;
    }

    // Handle Enter to add tag
    if (e.key === 'Enter' && inputValue.trim() && !isDropdownOpen) {
      e.preventDefault();
      addTag(inputValue);
      return;
    }

    // Handle comma as delimiter
    if (e.key === ',' && delimiters.includes(',') && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
      return;
    }

    // Handle other delimiters (except Enter which is handled above)
    if (delimiters.includes(e.key) && e.key !== 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
      return;
    }
  };

  const descriptionId = displayDescription ? `${inputId}-description` : undefined;
  const errorId = displayError ? `${inputId}-error` : undefined;
  const computedAriaDescribedBy = [
    descriptionId,
    errorId
  ].filter(Boolean).join(' ') || undefined;

  const listboxId = `${inputId}-suggestions`;

  // Match Input size classes exactly
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  // Container padding matches Input
  const containerPaddingClasses = {
    sm: 'px-2 py-1 min-h-[2rem] gap-1.5',
    md: 'px-3 py-2 min-h-[2.5rem] gap-2',
    lg: 'px-4 py-3 min-h-[3rem] gap-2'
  };

  const variantClasses = {
    default: 'border-input-border focus-within:ring-accent-500 focus-within:border-accent-500',
    error: 'border-red-300 focus-within:ring-red-500 focus-within:border-red-500',
    success: 'border-green-300 focus-within:ring-green-500 focus-within:border-green-500'
  };

  return (
    <div className={cn('w-full', className)} ref={containerRef}>
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
          {displayLabel}
        </label>
      )}

      <div className="relative">
        {/* Tags container with input */}
        <div
          className={cn(
            'flex flex-wrap items-center w-full border rounded-lg',
            'bg-input-bg text-input-text',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-0 transition-colors',
            containerPaddingClasses[size],
            variantClasses[variant],
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Existing tags */}
          {value.map((tag, index) => (
            <Tag
              key={`${tag}-${index}`}
              size={size}
              onRemove={() => removeTag(index)}
              disabled={disabled}
            >
              {tag}
            </Tag>
          ))}

          {/* Input field */}
          <input
            ref={(node) => {
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
              inputRef.current = node;
            }}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onFocus={() => {
              const computedFiltered = computeFilteredSuggestions(inputValue, allSuggestions, value);
              if (inputValue.trim() && (computedFiltered.length > 0 || isLoadingSuggestions)) {
                setIsDropdownOpen(true);
              }
            }}
            placeholder={value.length === 0 ? displayPlaceholder : ''}
            disabled={disabled}
            className={cn(
              'flex-1 min-w-[120px] border-0 bg-transparent outline-none',
              sizeClasses[size],
              'text-input-text',
              'placeholder:text-input-placeholder',
              disabled && 'cursor-not-allowed'
            )}
            id={inputId}
            role="combobox"
            aria-expanded={isDropdownOpen}
            aria-controls={isDropdownOpen ? listboxId : undefined}
            aria-haspopup="listbox"
            aria-label={ariaLabel || displayLabel || 'Tag input'}
            aria-describedby={computedAriaDescribedBy}
            aria-autocomplete="list"
            aria-activedescendant={
              focusedSuggestionIndex >= 0
                ? `${inputId}-suggestion-${focusedSuggestionIndex}`
                : undefined
            }
            data-testid={dataTestId}
            {...restProps}
          />
        </div>

        {/* Suggestions dropdown */}
        {isDropdownOpen && (filteredSuggestions.length > 0 || isLoadingSuggestions) && (
          <div
            ref={dropdownRef}
            id={listboxId}
            role="listbox"
            className={cn(
              'absolute z-50 w-full mt-1 bg-surface-overlay',
              'border border-line-default rounded-lg shadow-lg',
              'max-h-60 overflow-y-auto'
            )}
          >
            {isLoadingSuggestions && (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                Loading suggestions...
              </div>
            )}
            {!isLoadingSuggestions && filteredSuggestions.length === 0 && inputValue.trim() && (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No suggestions found
              </div>
            )}
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                id={`${inputId}-suggestion-${index}`}
                role="option"
                aria-selected={focusedSuggestionIndex === index}
                onClick={() => addTag(suggestion)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm text-input-text',
                  'hover:bg-surface-card/70',
                  'focus:outline-none focus:bg-surface-card/70',
                  focusedSuggestionIndex === index && 'bg-accent-50 dark:bg-accent-900/20'
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Live region for screen reader announcements */}
      <div
        ref={liveRegionRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />

      {displayError && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}

      {displayDescription && !displayError && (
        <p id={descriptionId} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
