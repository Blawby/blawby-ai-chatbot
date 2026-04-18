import { forwardRef, useState } from 'preact/compat';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

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
    default: 'focus:ring-2 ring-inset focus:ring-accent-500/30',
    error: 'ring-2 ring-inset ring-red-500/40 focus:ring-red-500/60',
    success: 'ring-2 ring-inset ring-green-500/40'
  };

  const inputClasses = cn(
    'w-full rounded-xl text-input-text placeholder:text-input-placeholder',
    'focus:outline-none transition-all duration-200',
    'glass-input border-none',
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

  const getStrengthText = (strength: number) => {
    if (strength <= 1) return 'Very weak';
    if (strength <= 2) return 'Weak';
    if (strength <= 3) return 'Good';
    return 'Strong';
  };

  const getStrengthVariant = (strength: number): 'error' | 'warning' | 'info' | 'success' => {
    if (strength <= 1) return 'error';
    if (strength <= 2) return 'warning';
    if (strength <= 3) return 'info';
    return 'success';
  };

  const strength = calculateStrength(value);
  const strengthText = getStrengthText(strength);
  const strengthVariant = getStrengthVariant(strength);
  const strengthVariantClasses: Record<'error' | 'warning' | 'info' | 'success', string> = {
    error: 'status-error',
    warning: 'status-warning',
    info: 'status-info',
    success: 'status-success'
  };

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
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-input-placeholder hover:text-[rgb(var(--accent-foreground))] focus:ring-2 ring-inset focus:ring-accent-500 focus:ring-offset-1 focus-visible:ring-2 ring-inset focus-visible:ring-accent-500 focus-visible:ring-offset-1"
        >
          {showPassword ? (
            <Icon icon={EyeSlashIcon} className="w-4 h-4"  />
          ) : (
            <Icon icon={EyeIcon} className="w-4 h-4"  />
          )}
        </button>
      </div>
      
      {showStrength && value && (
        <div className="mt-2 flex items-center justify-between text-xs text-input-placeholder">
          <span>Password strength:</span>
          <span className={cn('px-2 py-0.5 rounded-full font-medium', strengthVariantClasses[strengthVariant])}>
            {strengthText}
          </span>
        </div>
      )}
      
      {displayError && (
        <p id={errorId} className="text-xs text-accent-error dark:text-accent-error-light mt-1" role="alert" aria-live="assertive">
          {displayError}
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
