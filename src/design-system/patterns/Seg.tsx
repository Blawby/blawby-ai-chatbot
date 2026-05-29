import { cn } from '@/shared/utils/cn';

export interface SegOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Seg — chat-first segmented control (DESIGN_SYSTEM §7 refactor mapping).
 *
 * Simple inline-flex of buttons with right-border separators; active state
 * via `.seg-on` (ink bg + accent fg). No animated thumb — that's the
 * `SegmentedToggle` primitive's job, which remains for callers that want
 * the sliding indicator. Pick per surface.
 */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false
}: SegProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('seg', className)}>
      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = disabled || option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isDisabled}
            className={cn(isActive && 'seg-on')}
            onClick={() => {
              if (!isDisabled) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
