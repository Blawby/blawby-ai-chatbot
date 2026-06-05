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

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [inputRef]);

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
    'w-full rounded-r-md text-ink placeholder:text-dim-2',
    'focus:outline-none transition-all duration-200',
    'field border-none',
    sizeClasses[size],
    variant === 'error' || error ? 'is-error' : '',
    variant === 'success' && 'is-success',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  );

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-ink">
          {label}
          {required ? <span className="ml-1 text-red-500">*</span> : null}
        </label>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-dim-2">
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
            const raw = event.currentTarget.value;
            // Strip everything that isn't a digit or a decimal point, then
            // collapse any extra decimal points so the field can never display
            // a non-numeric character (e.g. "12a3" → "123", "1.2.3" → "1.23").
            const stripped = raw.replace(/[^\d.]/g, '');
            const firstDot = stripped.indexOf('.');
            const cleaned = firstDot === -1
              ? stripped
              : stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '');
            if (cleaned !== raw) {
              // Reflect the sanitized value into the DOM so the bad character
              // never appears — Preact doesn't re-sync the input when state
              // skips the update. Preserve the caret by mapping the prior
              // selection through the same character-removal that produced
              // `cleaned`, so typing in the middle of the value doesn't jump
              // the cursor to the end.
              const target = event.currentTarget;
              const selStart = target.selectionStart;
              const selEnd = target.selectionEnd;
              const mapIndex = (idx: number | null): number => {
                if (idx === null) return cleaned.length;
                const prefix = raw.slice(0, idx);
                const cleanedPrefix = prefix.replace(/[^\d.]/g, '');
                const firstDotInPrefix = cleanedPrefix.indexOf('.');
                const adjustedPrefix = firstDotInPrefix === -1
                  ? cleanedPrefix
                  : cleanedPrefix.slice(0, firstDotInPrefix + 1)
                    + cleanedPrefix.slice(firstDotInPrefix + 1).replace(/\./g, '');
                return Math.min(adjustedPrefix.length, cleaned.length);
              };
              const nextStart = mapIndex(selStart);
              const nextEnd = mapIndex(selEnd);
              target.value = cleaned;
              try {
                target.setSelectionRange(nextStart, nextEnd);
              } catch {
                // Some input types (e.g. number) reject setSelectionRange; ignore.
              }
            }
            setDisplayValue(cleaned);
            if (!cleaned) {
              onChange?.(undefined);
              return;
            }
            if (cleaned.endsWith('.')) {
              // leave user in editing mode
              return;
            }
            const parsed = parseFloat(cleaned);
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
        <p id={descriptionId} className="mt-1 text-xs text-dim-2">
          {description}
        </p>
      ) : null}
    </div>
  );
});
