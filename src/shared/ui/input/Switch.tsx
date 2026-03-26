// import { ComponentChildren } from 'preact'; // Unused
import { cn } from '@/shared/utils/cn';

export interface SwitchProps {
  label?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
  className?: string;
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
  size = 'md',
  id
}: SwitchProps) => {
  const sizeClasses = {
    sm: 'h-4 w-8',
    md: 'h-6 w-11',
    lg: 'h-8 w-14'
  };

  const thumbSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-6 w-6'
  };

  const thumbTranslateClasses = {
    sm: value ? 'translate-x-[18px]' : 'translate-x-0.5',
    md: value ? 'translate-x-6' : 'translate-x-1',
    lg: value ? 'translate-x-7' : 'translate-x-1'
  };

  return (
    <div className={cn('flex items-center justify-between py-3', className)}>
      <div className="flex-1 min-w-0">
        {label && (
          <div
            className="text-sm font-medium text-input-text"
            id={id ? `${id}-label` : undefined}
          >
            {label}
          </div>
        )}
        {description && (
          <div className="mt-1 text-xs text-input-placeholder">
            {description}
          </div>
        )}
      </div>
      
      <button
        type="button"
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent',
          sizeClasses[size],
          value 
            ? 'bg-accent-500 focus:ring-accent-500' 
            : 'bg-zinc-400/70 dark:bg-zinc-600/80 focus:ring-zinc-400',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        aria-pressed={value}
        aria-label={id ? undefined : (label || 'Toggle switch')}
        id={id}
        aria-labelledby={id ? `${id}-label` : undefined}
      >
        <span
          className={cn(
            'inline-block transform rounded-full bg-zinc-900 dark:bg-white shadow-sm transition-transform duration-200 ease-in-out',
            thumbSizeClasses[size],
            thumbTranslateClasses[size]
          )}
        />
      </button>
    </div>
  );
};
