import { forwardRef } from 'preact/compat';
import { ComponentChildren, JSX } from 'preact';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { useTranslation } from '@/shared/i18n/hooks';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

type InputIcon = IconComponent | ComponentChildren;

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
  icon?: InputIcon;
  iconClassName?: string;
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
  iconClassName = '',
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
  const isIconComponent = (iconValue: InputIcon | undefined): iconValue is IconComponent =>
    typeof iconValue === 'function';

  const descriptionId = displayDescription ? `${inputId}-description` : undefined;
  const errorId = displayError ? `${inputId}-error` : undefined;

  const computedAriaDescribedBy = [
    externalAriaDescribedBy,
    descriptionId,
    errorId
  ].filter(Boolean).join(' ') || undefined;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: '',
    lg: 'px-4 py-3 text-base'
  };

  const iconPaddingClasses = {
    sm: iconPosition === 'left' ? 'pl-8' : 'pr-8',
    md: iconPosition === 'left' ? 'pl-10' : 'pr-10',
    lg: iconPosition === 'left' ? 'pl-12' : 'pr-12'
  };

  const isError = variant === 'error' || Boolean(displayError);
  const isSuccess = variant === 'success';

  const inputClasses = cn(
    'input',
    sizeClasses[size],
    icon && iconPaddingClasses[size],
    isError && 'is-error',
    isSuccess && 'is-success',
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const renderIcon = () => {
    if (!icon) return null;

    if (isIconComponent(icon)) {
      return <Icon icon={icon} className={cn('w-4 h-4 text-dim', iconClassName)} />;
    }

    return (
      <div className="w-4 h-4 text-dim">
        {icon}
      </div>
    );
  };

  return (
    <div className="w-full">
      {displayLabel && (
        <label htmlFor={inputId} className="label mb-1.5 block">
          {displayLabel}
          {required && <span className="text-neg ml-1" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            {renderIcon()}
          </div>
        )}

        <input
          ref={ref}
          type={type}
          value={value}
          onInput={(e) => onChange?.((e.target as HTMLInputElement).value)}
          placeholder={displayPlaceholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          id={inputId}
          aria-label={ariaLabel}
          aria-describedby={computedAriaDescribedBy}
          aria-invalid={externalAriaInvalid !== undefined ? externalAriaInvalid : isError}
          aria-required={externalAriaRequired}
          aria-disabled={externalAriaDisabled}
          {...inputRestProps}
        />

        {icon && iconPosition === 'right' && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            {renderIcon()}
          </div>
        )}
      </div>

      {displayError && (
        <p id={errorId} className="text-xs text-neg mt-1" role="alert" aria-live="assertive">
          {displayError}
        </p>
      )}

      {displayDescription && !displayError && (
        <p id={descriptionId} className="mt-1 text-xs text-dim">
          {displayDescription}
        </p>
      )}
    </div>
  );
});
