import { forwardRef } from 'preact/compat';
import { useRef, useState } from 'preact/hooks';
import { Input } from './Input';

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
  id
}, ref) => {
  const formatValue = (nextValue?: number): string =>
    typeof nextValue === 'number' && Number.isFinite(nextValue) ? String(nextValue) : '';
  const [displayValue, setDisplayValue] = useState(() => formatValue(value));
  const lastValueRef = useRef(value);
  if (lastValueRef.current !== value) {
    lastValueRef.current = value;
    const nextDisplay = formatValue(value);
    if (nextDisplay !== displayValue) {
      setDisplayValue(nextDisplay);
    }
  }

  return (
    <Input
      ref={ref}
      id={id}
      type="text"
      label={label}
      description={description}
      error={error}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      className={className}
      size={size}
      variant={variant}
  icon={<span className="flex h-full w-full items-center justify-center text-gray-500">$</span>}
  iconPosition="left"
  value={displayValue}
      onChange={(nextValue) => {
        const trimmed = nextValue.trim();
        if (trimmed && !/^\d*\.?\d*$/.test(trimmed)) {
          return;
        }
        setDisplayValue(nextValue);
        if (!trimmed) {
          onChange?.(undefined);
          return;
        }
        // Allow standard decimal notation and intermediate states ("1.")
        if (trimmed.endsWith('.')) {
          return;
        }
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) {
          onChange?.(parsed);
        }
      }}
      min={min}
      step={step}
      inputMode="decimal"
    />
  );
});
