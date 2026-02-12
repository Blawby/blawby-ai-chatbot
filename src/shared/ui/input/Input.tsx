import { forwardRef } from 'preact/compat';
import { ComponentChildren, JSX } from 'preact';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface InputProps extends Omit<JSX.IntrinsicElements['input'], 'type' | 'value' | 'onChange' | 'onBlur' | 'size'> {
  type?: 'text' | 'password' | 'email' | 'tel' | 'url' | 'number' | 'search' | 'date';
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: (event: FocusEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  icon?: ComponentChildren;
  iconPosition?: 'left' | 'right';
  label?: string;
  description?: string;
  error?: string;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  pattern?: string;
  min?: string | number;
  max?: string | number;
  step?: number;
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  type = 'text',
  value = '',
  onChange,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  size = 'md',
  variant = 'default',
  icon,
  iconPosition = 'left',
  label,
  description,
  error,
  labelKey,
  descriptionKey,
  placeholderKey,
  errorKey,
  namespace = 'common',
  ...restProps
}, ref) => {
  const { t } = useTranslation(namespace);
  const generatedId = useUniqueId('input');
  const inputId = restProps.id || generatedId;
  
  // Extract ARIA props from restProps to preserve computed values
  const {
    'aria-label': ariaLabel,
    'aria-describedby': externalAriaDescribedBy,
    'aria-invalid': externalAriaInvalid,
    'aria-required': externalAriaRequired,
    'aria-disabled': externalAriaDisabled,
    ...inputRestProps
  } = restProps;
  
  const displayLabel = labelKey ? t(labelKey) : label;
  const displayDescription = descriptionKey ? t(descriptionKey) : description;
  const displayPlaceholder = placeholderKey ? t(placeholderKey) : placeholder;
  const displayError = errorKey ? t(errorKey) : error;

  // Generate stable IDs for description and error elements
  const descriptionId = displayDescription ? `${inputId}-description` : undefined;
  const errorId = displayError ? `${inputId}-error` : undefined;
  
  // Build computed aria-describedby combining external and internal IDs
  const computedAriaDescribedBy = [
    externalAriaDescribedBy,
    descriptionId,
    errorId
  ].filter(Boolean).join(' ') || undefined;

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const iconPaddingClasses = {
    sm: iconPosition === 'left' ? 'pl-8' : 'pr-8',
    md: iconPosition === 'left' ? 'pl-10' : 'pr-10',
    lg: iconPosition === 'left' ? 'pl-12' : 'pr-12'
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
    icon && iconPaddingClasses[size],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    variant === 'default' ? 'glass-input' : 'bg-input-bg border-input-border',
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
      
      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <div className="w-4 h-4 text-gray-400 dark:text-gray-500">
              {icon}
            </div>
          </div>
        )}
        
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}
          placeholder={displayPlaceholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          id={inputId}
          aria-label={ariaLabel}
          aria-describedby={computedAriaDescribedBy}
          aria-invalid={externalAriaInvalid !== undefined ? externalAriaInvalid : Boolean(error)}
          aria-required={externalAriaRequired}
          aria-disabled={externalAriaDisabled}
          {...inputRestProps}
        />
        
        {icon && iconPosition === 'right' && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <div className="w-4 h-4 text-gray-400 dark:text-gray-500">
              {icon}
            </div>
          </div>
        )}
      </div>
      
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
