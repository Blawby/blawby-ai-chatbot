import { forwardRef, useState } from 'preact/compat';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import { useUniqueId } from '../../../hooks/useUniqueId';

export interface PasswordInputProps {
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
  showStrength?: boolean;
  minLength?: number;
  maxLength?: number;
  labelKey?: string;
  descriptionKey?: string;
  placeholderKey?: string;
  errorKey?: string;
  namespace?: string;
  id?: string;
  'data-testid'?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({
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
  showStrength = false,
  minLength,
  maxLength,
  labelKey: _labelKey,
  descriptionKey: _descriptionKey,
  placeholderKey: _placeholderKey,
  errorKey: _errorKey,
  namespace: _namespace = 'common',
  id,
  'data-testid': dataTestId
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  
  // Generate stable unique ID for this component instance
  const generatedId = useUniqueId('password-input');
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
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const iconPaddingClasses = {
    sm: 'pr-8',
    md: 'pr-10',
    lg: 'pr-12'
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

  const calculateStrength = (password: string) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const getStrengthColor = (strength: number) => {
    if (strength <= 1) return 'text-red-600 dark:text-red-400';
    if (strength <= 2) return 'text-yellow-600 dark:text-yellow-400';
    if (strength <= 3) return 'text-blue-600 dark:text-blue-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getStrengthText = (strength: number) => {
    if (strength <= 1) return 'Very weak';
    if (strength <= 2) return 'Weak';
    if (strength <= 3) return 'Good';
    return 'Strong';
  };

  const strength = calculateStrength(value);
  const strengthColor = getStrengthColor(strength);
  const strengthText = getStrengthText(strength);

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
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}
          placeholder={displayPlaceholder}
          disabled={disabled}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          aria-required={required}
          aria-invalid={Boolean(displayError)}
          aria-describedby={ariaDescribedBy}
          className={inputClasses}
          data-testid={dataTestId}
        />
        
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          disabled={disabled}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:ring-2 focus:ring-accent-500 focus:ring-offset-1 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1"
        >
          {showPassword ? (
            <EyeSlashIcon className="w-4 h-4" />
          ) : (
            <EyeIcon className="w-4 h-4" />
          )}
        </button>
      </div>
      
      {showStrength && value && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Password strength:</span>
            <span className={strengthColor}>{strengthText}</span>
          </div>
          <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
            <div
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                strength <= 1 ? 'bg-red-500' :
                strength <= 2 ? 'bg-yellow-500' :
                strength <= 3 ? 'bg-blue-500' : 'bg-green-500'
              )}
              style={{ width: `${(strength / 5) * 100}%` }}
            />
          </div>
        </div>
      )}
      
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
