import type { JSX } from 'preact';
import { useCallback, useRef } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';

export interface PINInputProps {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  size?: 'sm' | 'md' | 'lg';
  mask?: boolean;
  className?: string;
  'aria-label'?: string;
}

const sizeClasses = {
  sm: 'w-8 h-10 text-sm',
  md: 'w-10 h-12 text-base',
  lg: 'w-12 h-14 text-lg',
};

export function PINInput({
  length = 6,
  value = '',
  onChange,
  onComplete,
  disabled = false,
  error = false,
  size = 'md',
  mask = false,
  className,
  'aria-label': ariaLabel = 'PIN input',
}: PINInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
  };

  const handleInput = useCallback(
    (index: number, e: JSX.TargetedEvent<HTMLInputElement>) => {
      const target = e.target as HTMLInputElement;
      const char = target.value.slice(-1);

      if (!/^\d$/.test(char) && char !== '') return;

      const chars = value.split('');
      chars[index] = char;
      const next = chars.join('').slice(0, length);
      onChange?.(next);

      if (char && index < length - 1) {
        focusInput(index + 1);
      }

      if (next.length === length) {
        onComplete?.(next);
      }
    },
    [value, length, onChange, onComplete],
  );

  const handleKeyDown = useCallback(
    (index: number, e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        const chars = value.split('');
        if (chars[index]) {
          chars[index] = '';
          onChange?.(chars.join(''));
        } else if (index > 0) {
          chars[index - 1] = '';
          onChange?.(chars.join(''));
          focusInput(index - 1);
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        focusInput(index - 1);
      } else if (e.key === 'ArrowRight' && index < length - 1) {
        focusInput(index + 1);
      }
    },
    [value, length, onChange],
  );

  const handlePaste = useCallback(
    (e: JSX.TargetedClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData?.getData('text/plain')?.replace(/\D/g, '').slice(0, length);
      if (pasted) {
        onChange?.(pasted);
        focusInput(Math.min(pasted.length, length - 1));
        if (pasted.length === length) onComplete?.(pasted);
      }
    },
    [length, onChange, onComplete],
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex gap-2', className)}
    >
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type={mask ? 'password' : 'text'}
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onInput={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            'glass-input text-center font-medium rounded-xl',
            sizeClasses[size],
            'focus-visible:outline-none',
            error && 'glass-input isError',
            'disabled:opacity-45 disabled:cursor-not-allowed',
            'transition-all duration-200',
          )}
        />
      ))}
    </div>
  );
}
