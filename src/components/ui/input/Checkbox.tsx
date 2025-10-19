import { forwardRef, useEffect, useRef, RefObject } from 'preact/compat';
import { ComponentChildren } from 'preact';
import { cn } from '../../../utils/cn';
import { useUniqueId } from '../../../hooks/useUniqueId';

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'error' | 'success';
  label?: string | ComponentChildren;
  description?: string;
  error?: string;
  indeterminate?: boolean;
  labelKey?: string;
  descriptionKey?: string;
  errorKey?: string;
  namespace?: string;
  id?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
  checked = false,
  onChange,
  disabled = false,
  required = false,
  className = '',
  size = 'md',
  variant = 'default',
  label,
  description,
  error,
  indeterminate = false,
  labelKey,
  descriptionKey,
  errorKey,
  namespace = 'common',
  id
}, ref) => {
  // TODO: Add i18n support when useTranslation hook is available
  // const { t } = useTranslation(namespace);
  // const displayLabel = labelKey ? t(labelKey) : label;
  // const displayDescription = descriptionKey ? t(descriptionKey) : description;
  // const displayError = errorKey ? t(errorKey) : error;
  
  const displayLabel = label;
  const displayDescription = description;
  const _displayError = error;

  // Generate stable unique ID for this component instance
  const generatedId = useUniqueId('checkbox');
  const checkboxId = id || generatedId;
  const descriptionId = `${checkboxId}-description`;
  const errorId = `${checkboxId}-error`;

  // Create internal ref for indeterminate handling
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper function to safely assign refs
  const assignRef = (node: HTMLInputElement | null, targetRef: RefObject<HTMLInputElement | null>, forwardedRef?: unknown) => {
    // Update the target ref
    if (targetRef) {
      (targetRef as RefObject<HTMLInputElement | null>).current = node;
    }
    
    // Handle forwarded ref (function or object)
    if (forwardedRef) {
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef && typeof forwardedRef === 'object') {
        forwardedRef.current = node;
      }
    }
  };

  // Create merged ref function
  const mergedRef = (node: HTMLInputElement | null) => {
    assignRef(node, inputRef, ref);
  };

  // Handle indeterminate state
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const variantClasses = {
    default: 'border-gray-300 dark:border-gray-600 focus:ring-accent-500 focus:border-accent-500',
    error: 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500',
    success: 'border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500'
  };

  const checkboxClasses = cn(
    'rounded border bg-white dark:bg-gray-800 text-accent-600',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    sizeClasses[size],
    variantClasses[variant],
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  return (
    <div className="flex items-start space-x-3">
      <div className="flex items-center h-5">
        <input
          ref={mergedRef}
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.((e.target as HTMLInputElement).checked)}
          disabled={disabled}
          required={required}
          className={checkboxClasses}
          aria-describedby={[description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? 'true' : 'false'}
        />
      </div>
      
      <div className="flex-1 min-w-0">
        {displayLabel && (
          <label htmlFor={checkboxId} className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {displayLabel}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        {displayDescription && !error && (
          <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {displayDescription}
          </p>
        )}
        
        {error && (
          <p id={errorId} className="text-xs text-red-600 mt-1" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
});
