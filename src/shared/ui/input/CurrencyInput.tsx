import { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useRef } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { useUniqueId } from '@/shared/hooks/useUniqueId';

export interface CurrencyInputProps {
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
  step?: number;
  id?: string;
}

const formatCurrencyDisplay = (value?: number): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '';

const formatRawDisplay = (value?: number): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(({
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
  min = 0,
  step = 0.01,
  id,
}, ref) => {
  const generatedId = useUniqueId('currency-input');
  const inputId = id || generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditingRef = useRef(false);
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const ariaDescribedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  useEffect(() => {
    if (!inputRef.current || isEditingRef.current) return;
    inputRef.current.value = formatCurrencyDisplay(value);
  }, [value]);

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm pl-8',
    md: 'px-3 py-2.5 text-sm pl-10',
    lg: 'px-4 py-3 text-base pl-12',
  };

  const inputClasses = cn(
    'w-full rounded-xl text-input-text placeholder:text-input-placeholder',
    'focus:outline-none transition-all duration-200',
    'glass-input border-none',
    sizeClasses[size],
    variant === 'error' || error ? 'isError' : '',
    variant === 'success' && 'isSuccess',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  );

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-input-text">
          {label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </label>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-input-placeholder">
          <span className="text-sm">$</span>
        </div>

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          defaultValue={formatCurrencyDisplay(value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          min={min}
          step={step}
          inputMode="decimal"
          onFocus={(event) => {
            isEditingRef.current = true;
            event.currentTarget.value = formatRawDisplay(value);
          }}
          onBlur={(event) => {
            const trimmed = event.currentTarget.value.trim();
            isEditingRef.current = false;
            if (!trimmed) {
              event.currentTarget.value = '';
              onChange?.(undefined);
              return;
            }
            const parsed = Number(trimmed);
            if (!Number.isFinite(parsed)) {
              event.currentTarget.value = formatCurrencyDisplay(value);
              return;
            }
            event.currentTarget.value = formatCurrencyDisplay(parsed);
            onChange?.(parsed);
          }}
          onInput={(event) => {
            const nextValue = event.currentTarget.value;
            const trimmed = nextValue.trim();
            if (trimmed && !/^\d*\.?\d*$/.test(trimmed)) {
              event.currentTarget.value = formatRawDisplay(value);
              return;
            }
            if (!trimmed) {
              onChange?.(undefined);
              return;
            }
            if (trimmed.endsWith('.')) {
              return;
            }
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed)) {
              onChange?.(parsed);
            }
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={ariaDescribedBy}
        />
      </div>

      {error ? (
        <p id={errorId} className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      {description ? (
        <p id={descriptionId} className="mt-1 text-xs text-input-placeholder">
          {description}
        </p>
      ) : null}
    </div>
  );
});
