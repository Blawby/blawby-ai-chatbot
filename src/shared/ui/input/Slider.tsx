import type { JSX } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import { forwardRef } from 'preact/compat';
import { cn } from '@/shared/utils/cn';

export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  label?: string;
  className?: string;
  'aria-label'?: string;
}

const sizeConfig = {
  sm: {
    track:
      '[&::-webkit-slider-runnable-track]:h-1 [&::-moz-range-track]:h-1',
    thumb:
      '[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3',
    thumbOffset: '[&::-webkit-slider-thumb]:-mt-[4px]',
  },
  md: {
    track:
      '[&::-webkit-slider-runnable-track]:h-1.5 [&::-moz-range-track]:h-1.5',
    thumb:
      '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
    thumbOffset: '[&::-webkit-slider-thumb]:-mt-[5px]',
  },
  lg: {
    track:
      '[&::-webkit-slider-runnable-track]:h-2 [&::-moz-range-track]:h-2',
    thumb:
      '[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5',
    thumbOffset: '[&::-webkit-slider-thumb]:-mt-[6px]',
  },
};

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    min = 0,
    max = 100,
    step = 1,
    value,
    defaultValue = 0,
    onChange,
    disabled = false,
    size = 'md',
    showValue = false,
    label,
    className,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const percent = ((currentValue - min) / (max - min)) * 100;

  const handleInput = useCallback(
    (e: JSX.TargetedEvent<HTMLInputElement>) => {
      const next = Number((e.target as HTMLInputElement).value);
      setInternalValue(next);
      onChange?.(next);
    },
    [onChange],
  );

  const { track, thumb, thumbOffset } = sizeConfig[size];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-xs text-input-placeholder">{label}</span>}
          {showValue && (
            <span className="text-xs font-medium text-input-text tabular-nums">
              {currentValue}
            </span>
          )}
        </div>
      )}
      <div className="relative flex items-center">
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onInput={handleInput}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={currentValue}
          className={cn(
            'w-full appearance-none bg-transparent cursor-pointer',
            'disabled:opacity-45 disabled:cursor-not-allowed',
            '[&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-black/10 dark:[&::-webkit-slider-runnable-track]:bg-white/10',
            track,
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white dark:[&::-webkit-slider-thumb]:border-slate-800',
            thumb,
            thumbOffset,
            'focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-accent-500/50 [&:focus-visible::-webkit-slider-thumb]:ring-offset-2',
            '[&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-black/10 dark:[&::-moz-range-track]:bg-white/10',
            '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent-500 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white dark:[&::-moz-range-thumb]:border-slate-800',
          )}
          style={{
            background: disabled
              ? undefined
              : `linear-gradient(to right, rgb(var(--accent-500)) ${percent}%, transparent ${percent}%)`,
          }}
        />
      </div>
    </div>
  );
});
