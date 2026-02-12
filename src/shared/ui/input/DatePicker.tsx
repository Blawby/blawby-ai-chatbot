import { forwardRef } from 'preact/compat';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface DatePickerProps {
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
  min?: string;
  max?: string;
  format?: 'date' | 'datetime-local' | 'time' | 'month' | 'week';
  isBirthday?: boolean;
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  autoComplete?: string;
  name?: string;
  pattern?: string;
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  'aria-disabled'?: boolean;
  'data-testid'?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({ 
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
  min,
  max,
  format = 'date',
  isBirthday = false,
  inputMode,
  autoComplete,
  name,
  pattern,
  enterKeyHint,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  placeholderKey: _placeholderKey,
  errorKey: _errorKey,
  namespace: _namespace = 'common',
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-disabled': ariaDisabled,
  ...restProps
}, ref) => {
  // Generate stable ID for accessibility
  const generatedId = useUniqueId('datepicker');
  const inputId = id || generatedId;

  // TODO: Add i18n support when useTranslation hook is available
  // const { t } = useTranslation(namespace);
  // const displayLabel = labelKey ? t(labelKey) : label;
  // const displayDescription = descriptionKey ? t(descriptionKey) : description;
  // const displayPlaceholder = placeholderKey ? t(placeholderKey) : placeholder;
  // const displayError = errorKey ? t(errorKey) : error;
  
  const displayLabel = label;
  const displayDescription = description;
  const displayPlaceholder = placeholder;
  const _displayError = error;

  // Generate stable IDs for description and error elements
  const descriptionId = displayDescription ? `${inputId}-description` : undefined;
  const errorId = _displayError ? `${inputId}-error` : undefined;

  const computedAriaDescribedBy = [
    ariaDescribedBy,
    descriptionId,
    errorId
  ].filter(Boolean).join(' ') || undefined;
  const resolvedInputMode = inputMode ?? (format === 'date' ? 'numeric' : undefined);
  const resolvedPattern = pattern ?? (format === 'date' ? '\\d{4}-\\d{2}-\\d{2}' : undefined);
  const resolvedAutoComplete = isBirthday ? 'bday' : autoComplete;

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const variantClasses = {
    default: 'border-input-border focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 focus:ring-green-500 focus:border-green-500'
  };

  const inputClasses = cn(
    'w-full min-h-[44px] border rounded-lg bg-input-bg text-input-text placeholder:text-input-placeholder',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    'appearance-none',
    sizeClasses[size],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        id={inputId}
        ref={ref}
        type={format}
        value={value}
        onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}
        placeholder={displayPlaceholder}
        disabled={disabled}
        required={required}
        min={min}
        max={max}
        name={name}
        inputMode={resolvedInputMode}
        autoComplete={resolvedAutoComplete}
        pattern={resolvedPattern}
        enterKeyHint={enterKeyHint}
        className={inputClasses}
        aria-label={ariaLabel}
        aria-describedby={computedAriaDescribedBy}
        aria-invalid={ariaInvalid !== undefined ? ariaInvalid : Boolean(_displayError)}
        aria-required={ariaRequired}
        aria-disabled={ariaDisabled}
        {...restProps}
      />
      
      {_displayError && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {_displayError}
        </p>
      )}
      
      {displayDescription && !_displayError && (
        <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
