import { forwardRef } from 'preact/compat';
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
  const stringValue = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '';

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
  value={stringValue}
      onChange={(nextValue) => {
        const trimmed = nextValue.trim();
        if (!trimmed) {
          onChange?.(undefined);
          return;
        }
        // Allow only standard decimal notation (no exponential or infinity)
        if (!/^-?\d*\.?\d+$/.test(trimmed)) {
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
