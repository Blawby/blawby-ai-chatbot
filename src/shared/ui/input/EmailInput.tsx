import { forwardRef } from 'preact/compat';
import { EnvelopeIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface EmailInputProps {
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
  showValidation?: boolean;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  'data-testid'?: string;
}

export const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(({
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
  showValidation = false,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  placeholderKey: _placeholderKey,
  errorKey: _errorKey,
  namespace: _namespace = 'common',
  'data-testid': dataTestId
}, ref) => {
  // Generate stable unique IDs for accessibility
  const inputId = useUniqueId('email-input');
  const descriptionId = useUniqueId('email-description');
  const validationErrorId = useUniqueId('email-validation-error');
  const externalErrorId = useUniqueId('email-external-error');

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
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const iconPaddingClasses = {
    sm: 'pl-8',
    md: 'pl-10',
    lg: 'pl-12'
  };

  const variantClasses = {
    default: 'border-gray-300 dark:border-gray-600 focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500'
  };

  const inputClasses = cn(
    'w-full border rounded-lg bg-white dark:bg-dark-input-bg text-gray-900 dark:text-white',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    sizeClasses[size],
    iconPaddingClasses[size],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isEmailValid = value ? isValidEmail(value) : false;
  const showValidationIcon = showValidation && (value?.length ?? 0) > 0;
  
  // Combined invalid state: displayError OR (showValidation && value && !isEmailValid)
  const isInvalid = displayError || (showValidation && value && !isEmailValid);

  // Build aria-describedby attribute
  const describedByIds = [];
  if (displayDescription && !displayError) {
    describedByIds.push(descriptionId);
  }
  if (displayError) {
    describedByIds.push(externalErrorId);
  } else if (showValidation && value && !isEmailValid) {
    describedByIds.push(validationErrorId);
  }
  const ariaDescribedBy = describedByIds.length > 0 ? describedByIds.join(' ') : undefined;

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <EnvelopeIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </div>
        
        <input
          ref={ref}
          id={inputId}
          type="email"
          value={value}
          onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}
          placeholder={displayPlaceholder}
          disabled={disabled}
          required={required}
          aria-invalid={isInvalid ? 'true' : 'false'}
          aria-required={required}
          aria-describedby={ariaDescribedBy}
          className={inputClasses}
          data-testid={dataTestId}
        />
        
        {showValidationIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {isEmailValid ? (
              <CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <XMarkIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
          </div>
        )}
      </div>
      
      {displayError && (
        <p id={externalErrorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}
      
      {showValidation && value && !isEmailValid && !displayError && (
        <p id={validationErrorId} className="text-xs text-red-600 dark:text-red-400 mt-1">
          Please enter a valid email address
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
