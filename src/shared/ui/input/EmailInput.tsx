import { forwardRef } from 'preact/compat';
import { EnvelopeIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface EmailInputProps {
  id?: string;
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
  id,
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
  const generatedInputId = useUniqueId('email-input');
  const inputId = id || generatedInputId;
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
    md: 'px-3 py-2.5 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const iconPaddingClasses = {
    sm: 'pl-8',
    md: 'pl-10',
    lg: 'pl-12'
  };

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isEmailValid = value ? isValidEmail(value) : false;
  const isInvalid = displayError || (showValidation && value && !isEmailValid);

  const variantClasses = {
    default: '',
    error: 'isError',
    success: 'isSuccess'
  };

  const inputClasses = cn(
    'w-full rounded-xl text-input-text placeholder:text-input-placeholder',
    'focus:outline-none transition-all duration-200',
    'glass-input border-none',
    sizeClasses[size],
    iconPaddingClasses[size],
    variantClasses[variant],
    isInvalid && 'isError',
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const showValidationIcon = showValidation && (value?.length ?? 0) > 0;

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
        <label htmlFor={inputId} className="block text-sm font-medium text-input-text mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <div className="absolute inset-y-0 left-0 z-10 flex items-center pl-3 pointer-events-none">
          <Icon icon={EnvelopeIcon} className="w-4 h-4 text-input-placeholder"  />
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
          <div className="absolute inset-y-0 right-0 z-10 flex items-center pr-3 pointer-events-none">
            {isEmailValid ? (
              <Icon icon={CheckIcon} className="w-4 h-4 text-accent-success"  />
            ) : (
              <Icon icon={XMarkIcon} className="w-4 h-4 text-accent-error"  />
            )}
          </div>
        )}
      </div>
      
      {displayError && (
        <p id={externalErrorId} className="text-xs text-accent-error mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}
      
      {showValidation && value && !isEmailValid && !displayError && (
        <p id={validationErrorId} className="text-xs text-accent-error mt-1">
          Please enter a valid email address
        </p>
      )}
      
      {displayDescription && !displayError && (
        <p id={descriptionId} className="text-xs text-input-placeholder mt-1">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
