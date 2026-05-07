import { useRef, useState, useLayoutEffect } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';

export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedToggleProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedToggleOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

export const SegmentedToggle = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  disabled = false
}: SegmentedToggleProps<T>) => {
  const count = options.length;
  const safeCount = Math.max(1, count);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  // Outer rail padding and the gap between items must be subtracted from the track
  // before splitting into per-item slots; otherwise the thumb drifts as items shrink.
  // Read inset from CSS variable to support compact sizing (0.25rem fallback).
  const rootRef = useRef<HTMLDivElement>(null);
  const [thumbInsetRem, setThumbInsetRem] = useState(0.25);
  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const computed = getComputedStyle(rootRef.current).getPropertyValue('--segmented-toggle-inset');
    const parsed = parseFloat(computed);
    setThumbInsetRem(isNaN(parsed) ? 0.25 : parsed);
  }, []);
  const itemGapRem = 0.25;
  const thumbInset = `${thumbInsetRem}rem`;
  const trackWidth = `100% - ${thumbInsetRem * 2}rem - ${(safeCount - 1) * itemGapRem}rem`;
  const slotWidth = `((${trackWidth}) / ${safeCount})`;

  return (
      <div
        ref={rootRef}
        className={cn(
        'segmented-toggle gap-1',
        (disabled || options.length === 0) && 'opacity-60',
        className
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden="true"
        className="segmented-toggle-thumb"
        style={{
          left: `calc(${thumbInset} + (${slotWidth} + ${itemGapRem}rem) * ${activeIndex})`,
          width: `calc(${slotWidth})`
        }}
      />
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled || option.disabled}
            onClick={() => {
              if (!disabled && !option.disabled) {
                onChange(option.value);
              }
            }}
            className={cn(
              'segmented-toggle-item flex-1 min-w-0 truncate',
              isActive ? 'segmented-toggle-item-active' : 'segmented-toggle-item-inactive',
              (disabled || option.disabled) && 'cursor-not-allowed'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
