import { forwardRef } from 'preact/compat';
import { useEffect, useImperativeHandle, useRef, useState } from 'preact/hooks';
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
  const [displayValue, setDisplayValue] = useState<string>(() => formatCurrencyDisplay(value));
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const ariaDescribedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  useEffect(() => {
    if (isEditingRef.current) return;
    setDisplayValue(formatCurrencyDisplay(value));
  }, [value]);

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm pl-8',
    md: 'px-3 py-2.5 text-sm pl-10',
    lg: 'px-4 py-3 text-base pl-12',
  };

  const precisionForStep = (stepNum: number) => {
    try {
      if (!Number.isFinite(stepNum) || stepNum <= 0) return 2;
      // Prefer a non-exponential fixed representation for counting decimals
      const raw = String(stepNum).includes('e') ? stepNum.toFixed(20) : String(stepNum);
      // Strip trailing zeros and possible trailing dot
      const cleaned = raw.replace(/(?:\.0+|0+)$/u, '');
      const parts = cleaned.split('.');
      if (parts.length === 2) {
        return Math.min(parts[1].length, 10);
      }
      return 0;
    } catch {
      return 2;
    }
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
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={inputClasses}
          inputMode="decimal"
          onFocus={() => {
            isEditingRef.current = true;
            setDisplayValue(formatRawDisplay(value));
          }}
          onBlur={(event) => {
            const trimmed = event.currentTarget.value.trim();
            isEditingRef.current = false;
            if (!trimmed) {
              setDisplayValue('');
              onChange?.(undefined);
              return;
            }
            let parsed = parseFloat(trimmed);
            if (!Number.isFinite(parsed)) parsed = 0;
            const stepNum = typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : 0.01;
            const precision = precisionForStep(stepNum);
            // Enforce min
            if (typeof min === 'number' && Number.isFinite(min) && parsed < min) parsed = min;
            // Snap to nearest step multiple
            const normalized = Math.round(parsed / stepNum) * stepNum;
            const rounded = Number(normalized.toFixed(precision));
            setDisplayValue(formatCurrencyDisplay(rounded));
            onChange?.(rounded);
          }}
          onInput={(event) => {
            const nextValue = event.currentTarget.value;
            const trimmed = nextValue.trim();
            // Allow only digits and at most one decimal point while editing
            if (trimmed && !/^\d*\.?\d*$/.test(trimmed)) {
              // ignore invalid chars
              return;
            }
            setDisplayValue(nextValue);
            if (!trimmed) {
              // empty input
              return;
            }
            if (trimmed.endsWith('.')) {
              // leave user in editing mode
              return;
            }
            // Parse and emit a normalized value matching the blur behavior
            const parsed = parseFloat(trimmed);
            if (!Number.isFinite(parsed)) return;
            const stepNum = typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : 0.01;
            const precision = precisionForStep(stepNum);
            let normalized = Math.round(parsed / stepNum) * stepNum;
            normalized = Number(normalized.toFixed(precision));
            // Don't force display reformat while editing; emit normalized numeric
            onChange?.(normalized);
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
