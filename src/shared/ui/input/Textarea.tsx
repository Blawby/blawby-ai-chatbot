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
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  value = '',
  onChange,
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
  id
}, ref) => {
  // Generate stable ID for accessibility
  const generatedId = useUniqueId('textarea');
  const textareaId = id || generatedId;

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

  // Track if component is mounted to skip initial render in effect
  const isMountedRef = useRef(false);

  // Initialize internalValue with proper truncation based on enforceMaxLength
  const getInitialValue = () => {
    if (enforceMaxLength === 'hard' || enforceMaxLength === 'truncate') {
      if (maxLength && value && value.length > maxLength) {
        return value.substring(0, maxLength);
      }
    }
    return value;
  };

  // Internal state to manage truncated value for hard and truncate modes
  const [internalValue, setInternalValue] = useState(getInitialValue);


  // Handle external value changes and truncation for hard and truncate modes
  useEffect(() => {
    // Skip initial render
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

  // Determine the actual value to use based on enforceMaxLength mode
  const actualValue = (enforceMaxLength === 'truncate' || enforceMaxLength === 'hard') ? internalValue : value;

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const variantClasses = {
    default: 'border-gray-300 dark:border-gray-600 focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500'
  };

  const resizeClasses = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize'
  };

  const textareaClasses = cn(
    'w-full border rounded-lg bg-white dark:bg-dark-input-bg text-gray-900 dark:text-white',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    sizeClasses[size],
    resizeClasses[resize],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const currentLength = actualValue?.length || 0;
  const isNearLimit = maxLength && currentLength > maxLength * 0.8;
  const isOverLimit = maxLength && currentLength > maxLength;

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          {displayLabel}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <textarea
        id={textareaId}
        ref={ref}
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
        placeholder={displayPlaceholder}
        disabled={disabled}
        required={required}
        rows={rows}
        maxLength={enforceMaxLength === 'soft' ? undefined : maxLength}
        className={textareaClasses}
      />
      
      {displayError && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
          {displayError}
        </p>
      )}
      
      <div className="flex justify-between items-center mt-1">
        {displayDescription && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {displayDescription}
          </p>
        )}
        
        {showCharCount && maxLength && (
          <p className={cn(
            'text-xs ml-auto',
            isOverLimit ? 'text-red-600 dark:text-red-400' : 
            isNearLimit ? 'text-yellow-600 dark:text-yellow-400' : 
            'text-gray-500 dark:text-gray-400'
          )}>
            {currentLength}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
});
