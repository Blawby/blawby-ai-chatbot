import { forwardRef, useEffect, useRef, useState } from 'preact/compat';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

/**
 * Textarea component with configurable maxLength enforcement behavior.
 *
 * @param enforceMaxLength - Controls how maxLength is enforced:
 *   - 'soft' (default): Removes HTML maxLength attribute, only shows validation/counter
 *   - 'hard': Keeps HTML maxLength to prevent typing, but truncates external values to prevent blocking
 *   - 'truncate': Always truncates incoming values and onChange events to never exceed maxLength
 */
export interface TextareaProps {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: (event: FocusEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  rows?: number;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  maxLength?: number;
  enforceMaxLength?: 'soft' | 'hard' | 'truncate';
  showCharCount?: boolean;
  label?: string;
  description?: string;
  error?: string;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  onKeyDown?: (event: import('preact').JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => void;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  value = '',
  onChange,
  onBlur,
  onFocus,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  size = 'md',
  variant = 'default',
  rows = 3,
  resize = 'vertical',
  maxLength,
  enforceMaxLength = 'soft',
  showCharCount = false,
  label,
  description,
  error,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  placeholderKey: _placeholderKey,
  errorKey: _errorKey,
  namespace: _namespace = 'common',
  id,
  name,
  autoFocus,
  onKeyDown
}, ref) => {
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const generatedId = useUniqueId('textarea');
  const textareaId = id || generatedId;

  const displayLabel = label;
  const displayDescription = description;
  const displayPlaceholder = placeholder;
  const displayError = error;

  const isMountedRef = useRef(false);

  const getInitialValue = () => {
    if (enforceMaxLength === 'hard' || enforceMaxLength === 'truncate') {
      if (maxLength && value && value.length > maxLength) {
        return value.substring(0, maxLength);
      }
    }
    return value;
  };

  const [internalValue, setInternalValue] = useState(getInitialValue);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    if (enforceMaxLength === 'hard' || enforceMaxLength === 'truncate') {
      if (maxLength && value && value.length > maxLength) {
        const truncatedValue = value.substring(0, maxLength);
        setInternalValue(truncatedValue);
      } else {
        setInternalValue(value);
      }
    } else {
      setInternalValue(value);
    }
  }, [value, maxLength, enforceMaxLength]);

  const actualValue = (enforceMaxLength === 'truncate' || enforceMaxLength === 'hard') ? internalValue : value;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: '',
    lg: 'px-4 py-3 text-base'
  };

  const resizeClasses = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize'
  };

  const isError = variant === 'error' || Boolean(displayError);
  const isSuccess = variant === 'success';

  const textareaClasses = cn(
    'textarea',
    sizeClasses[size],
    resizeClasses[resize],
    isError && 'is-error',
    isSuccess && 'is-success',
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const currentLength = actualValue?.length || 0;
  const isNearLimit = maxLength && currentLength > maxLength * 0.8;
  const isOverLimit = maxLength && currentLength > maxLength;

  useEffect(() => {
    if (!autoFocus || disabled) return;
    localTextareaRef.current?.focus();
  }, [autoFocus, disabled]);

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={textareaId} className="label mb-1.5 block">
          {displayLabel}
          {required && <span className="text-neg ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      <textarea
        id={textareaId}
        name={name}
        ref={(node) => {
          localTextareaRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
            return;
          }
          if (ref && typeof ref === 'object') {
            (ref as { current: HTMLTextAreaElement | null }).current = node;
          }
        }}
        value={actualValue}
        onChange={(e) => {
          const newValue = (e.target as HTMLTextAreaElement).value;
          if ((enforceMaxLength === 'truncate' || enforceMaxLength === 'hard') && maxLength && newValue.length > maxLength) {
            const truncatedValue = newValue.slice(0, maxLength);
            setInternalValue(truncatedValue);
            onChange?.(truncatedValue);
          } else {
            setInternalValue(newValue);
            onChange?.(newValue);
          }
        }}
        onPaste={(e) => {
          if ((enforceMaxLength === 'truncate' || enforceMaxLength === 'hard') && maxLength) {
            e.preventDefault();
            const pastedText = e.clipboardData?.getData('text') || '';
            const currentValue = actualValue || '';
            const target = e.target as HTMLTextAreaElement;
            const selectionStart = target.selectionStart || 0;
            const selectionEnd = target.selectionEnd || 0;
            const newValue = currentValue.slice(0, selectionStart) + pastedText + currentValue.slice(selectionEnd);
            const truncatedValue = newValue.slice(0, maxLength);
            setInternalValue(truncatedValue);
            onChange?.(truncatedValue);
          }
        }}
        onBlur={onBlur}
        onFocus={onFocus}
        placeholder={displayPlaceholder}
        disabled={disabled}
        required={required}
        rows={rows}
        onKeyDown={onKeyDown}
        maxLength={enforceMaxLength === 'soft' ? undefined : maxLength}
        className={textareaClasses}
      />

      {displayError && (
        <p className="text-xs text-neg mt-1">
          {displayError}
        </p>
      )}

      <div className="flex justify-between items-center mt-1">
        {displayDescription && (
          <p className="text-xs text-dim">
            {displayDescription}
          </p>
        )}

        {showCharCount && maxLength && (
          <p className={cn(
            'text-xs ml-auto tabular-nums',
            isOverLimit ? 'text-neg' :
            isNearLimit ? 'text-warn' :
            'text-dim'
          )}>
            {currentLength}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
});
