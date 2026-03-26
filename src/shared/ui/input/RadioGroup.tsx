import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface RadioOption {
  value: string;
  label: string;
  labelKey?: string;
  description?: string;
  descriptionKey?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  value?: string;
  onChange?: (value: string) => void;
  options: RadioOption[];
  disabled?: boolean;
  required?: boolean;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  label?: string;
  description?: string;
  error?: string;
  _labelKey?: string;
  _descriptionKey?: string;
  _errorKey?: string;
  _namespace?: string;
}

export const RadioGroup = ({
  value,
  onChange,
  options,
  disabled = false,
  required = false,
  className = '',
  orientation = 'vertical',
  size = 'md',
  variant = 'default',
  label,
  description,
  error,
  _labelKey,
  _descriptionKey,
  _errorKey,
  _namespace = 'common'
}: RadioGroupProps) => {
  // Generate stable unique group name for radio button grouping
  const groupName = useUniqueId('radio-group');
  
  // Generate unique instance ID to prevent ID collisions across multiple RadioGroup instances
  const instanceId = useUniqueId('radio-group-instance');
  const errorId = `${instanceId}-error`;
  
  // TODO: Add i18n support when useTranslation hook is available
  // const { t } = useTranslation(namespace);
  // const displayLabel = labelKey ? t(labelKey) : label;
  // const displayDescription = descriptionKey ? t(descriptionKey) : description;
  // const displayError = errorKey ? t(errorKey) : error;
  
  const displayLabel = label;
  const displayDescription = description;
  const displayError = error;

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const variantClasses = {
    default: 'border-input-border focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 focus:ring-green-500 focus:border-green-500'
  };

  const orientationClasses = {
    horizontal: 'flex flex-wrap gap-4',
    vertical: 'space-y-3'
  };

  return (
    <div className={cn('space-y-2', className)}>
      {displayLabel && (
        <label className="block text-sm font-medium text-input-text">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div 
        className={cn(orientationClasses[orientation])}
        role="radiogroup"
        aria-invalid={displayError ? 'true' : 'false'}
        aria-describedby={displayError ? errorId : undefined}
      >
        {options.map((option) => (
          <div key={option.value} className="flex items-start space-x-3">
            <div className="flex items-center h-5">
              <input
                type="radio"
                id={`${instanceId}-${option.value}`}
                name={groupName}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}
                disabled={disabled || option.disabled}
                required={required}
                className={cn(
                  'border bg-input-bg text-accent-600',
                  'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
                  sizeClasses[size],
                  variantClasses[variant],
                  (disabled || option.disabled) && 'opacity-50 cursor-not-allowed'
                )}
              />
            </div>
            
            <div className="flex-1 min-w-0">
              <label
                htmlFor={`${instanceId}-${option.value}`}
                className={cn(
                  'text-sm font-medium text-input-text',
                  (disabled || option.disabled) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {option.label}
              </label>
              
              {option.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {option.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {displayDescription && !displayError && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {displayDescription}
        </p>
      )}
      
      {displayError && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}
    </div>
  );
};
