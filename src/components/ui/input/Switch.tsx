// import { ComponentChildren } from 'preact'; // Unused
import { cn } from '../../../utils/cn';

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
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {label}
          </div>
        )}
        {description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {description}
          </div>
        )}
      </div>
      
      <button
        type="button"
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
          sizeClasses[size],
          value 
            ? 'bg-accent-600 focus:ring-accent-500' 
            : 'bg-gray-200 dark:bg-gray-700 focus:ring-gray-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        aria-pressed={value}
        aria-label={label ? `Toggle ${label}` : 'Toggle switch'}
        id={id}
        aria-labelledby={label ? `${id}-label` : undefined}
      >
        <span
          className={cn(
            'inline-block transform rounded-full bg-white transition-transform duration-200 ease-in-out',
            thumbSizeClasses[size],
            thumbTranslateClasses[size]
          )}
        />
      </button>
    </div>
  );
};