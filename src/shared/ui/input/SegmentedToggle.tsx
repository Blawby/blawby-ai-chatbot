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
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const itemWidth = count > 0 ? 100 / count : 100;

  return (
      <div
        className={cn(
        'segmented-toggle',
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
          left: '0.25rem',
          width: `calc(${itemWidth}% - 0.5rem)`,
          transform: `translateX(${activeIndex * 100}%)`
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
            style={{ width: `${itemWidth}%` }}
            className={cn(
              'segmented-toggle-item whitespace-nowrap',
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
