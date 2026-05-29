import { cn } from '@/shared/utils/cn';

export interface SwitchProps {
  label?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
  className?: string;
  /**
   * @deprecated DS toggle is single-size (36x20). Prop retained for API
   * compatibility; size variants are no-ops.
   */
  size?: 'sm' | 'md' | 'lg';
  id?: string;
}

export const Switch = ({
  label,
  value,
  onChange,
  description,
  disabled = false,
  className = '',
  id,
}: SwitchProps) => {
  return (
    <div className={cn('flex items-center justify-between py-3', className)}>
      <div className="flex-1 min-w-0">
        {label && (
          <div
            className="text-sm font-medium text-ink"
            id={id ? `${id}-label` : undefined}
          >
            {label}
          </div>
        )}
        {description && (
          <div className="mt-1 text-xs text-dim">
            {description}
          </div>
        )}
      </div>

      <button
        type="button"
        className={cn('toggle', value && 'on')}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        aria-pressed={value}
        aria-label={id ? undefined : (label || 'Toggle switch')}
        id={id}
        aria-labelledby={id ? `${id}-label` : undefined}
      />
    </div>
  );
};
