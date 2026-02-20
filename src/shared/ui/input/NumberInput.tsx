import { forwardRef, useCallback } from 'preact/compat';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface NumberInputProps {
  value?: number;
  onChange?: (value: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  label?: string;
  description?: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  showControls?: boolean;
  precision?: number;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  id?: string;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(({
  value,
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
  step = 1,
  showControls = true,
  precision = 0,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  placeholderKey: _placeholderKey,
  errorKey: _errorKey,
  namespace: _namespace = 'common',
  id
}, ref) => {
  // Generate stable unique IDs for accessibility
  const generatedId = useUniqueId('number-input');
  const inputId = id || generatedId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  // TODO: Add i18n support when useTranslation hook is available
  // const { t } = useTranslation(namespace);
  // const displayLabel = labelKey ? t(labelKey) : label;
  // const displayDescription = descriptionKey ? t(descriptionKey) : description;
  // const displayPlaceholder = placeholderKey ? t(placeholderKey) : placeholder;
  // const displayError = errorKey ? t(errorKey) : error;
  
  const displayLabel = label;
  const displayDescription = description;
  const displayPlaceholder = placeholder;
  const displayError = error;

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2.5 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const controlSizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  const variantClasses = {
    default: 'border-input-border focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-500 dark:border-red-400 focus:ring-red-500 dark:focus:ring-red-400 focus:border-red-500 dark:focus:border-red-400',
    success: 'border-green-500 dark:border-green-400 focus:ring-green-500 dark:focus:ring-green-400 focus:border-green-500 dark:focus:border-green-400'
  };

  const inputClasses = cn(
    'w-full border rounded-lg text-input-text placeholder:text-input-placeholder',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    sizeClasses[size],
    showControls && 'pr-20',
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    variant === 'default' ? 'glass-input' : 'bg-input-bg',
    className
  );

  const handleIncrement = useCallback(() => {
    if (disabled) return;
    const currentValue = value ?? (min ?? 0);
    const newValue = currentValue + step;
    const clampedValue = max !== undefined ? Math.min(newValue, max) : newValue;
    const roundedValue = Number(clampedValue.toFixed(precision));
    onChange?.(roundedValue);
  }, [value, step, min, max, precision, onChange, disabled]);

  const handleDecrement = useCallback(() => {
    if (disabled) return;
    const currentValue = value ?? (min ?? 0);
    const newValue = currentValue - step;
    const clampedValue = min !== undefined ? Math.max(newValue, min) : newValue;
    const roundedValue = Number(clampedValue.toFixed(precision));
    onChange?.(roundedValue);
  }, [value, step, min, precision, onChange, disabled]);

  const handleInputChange = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const inputValue = target.value;
    
    if (inputValue === '') {
      // Allow clearing the field by passing undefined
      onChange?.(undefined);
      return;
    }
    
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue)) {
      const roundedValue = Number(numValue.toFixed(precision));
      // Clamp the rounded value to min/max range
      const clampedValue = min !== undefined ? Math.max(roundedValue, min) : roundedValue;
      const finalClampedValue = max !== undefined ? Math.min(clampedValue, max) : clampedValue;
      onChange?.(finalClampedValue);
    }
  }, [onChange, precision, min, max]);

  const canIncrement = value === undefined || max === undefined || value < max;
  const canDecrement = value === undefined || min === undefined || value > min;

  // Build aria-describedby attribute
  const describedByIds = [];
  if (displayDescription && !displayError) {
    describedByIds.push(descriptionId);
  }
  if (displayError) {
    describedByIds.push(errorId);
  }
  const ariaDescribedBy = describedByIds.length > 0 ? describedByIds.join(' ') : undefined;

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type="number"
          value={value ?? ''}
          onChange={handleInputChange}
          placeholder={displayPlaceholder}
          disabled={disabled}
          required={required}
          min={min}
          max={max}
          step={step}
          aria-required={required}
          aria-invalid={Boolean(displayError)}
          aria-describedby={ariaDescribedBy}
          className={inputClasses}
        />
        
        {showControls && (
          <div className="absolute inset-y-0 right-0 flex flex-col">
            <button
              type="button"
              onClick={handleIncrement}
              disabled={disabled || !canIncrement}
              className={cn(
                'flex items-center justify-center border-l border-input-border rounded-r-lg',
                'glass-input hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-accent-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                controlSizeClasses[size],
                'rounded-tr-lg'
              )}
            >
              <PlusIcon className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleDecrement}
              disabled={disabled || !canDecrement}
              className={cn(
                'flex items-center justify-center border-l border-t border-input-border',
                'glass-input hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-accent-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                controlSizeClasses[size],
                'rounded-br-lg'
              )}
            >
              <MinusIcon className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      
      {displayError && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}
      
      {displayDescription && !displayError && (
        <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
