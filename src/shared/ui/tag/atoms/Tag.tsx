/**
 * Tag - Atom Component
 * 
 * Base tag/chip atom with optional remove button.
 * Reuses RemoveButton atom for consistency.
 */

import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { RemoveButton } from '../../upload/atoms/RemoveButton';

export interface TagProps {
  children: ComponentChildren;
  onRemove?: () => void;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const Tag = ({
  children,
  onRemove,
  variant = 'default',
  size = 'md',
  disabled = false,
  className,
  'aria-label': ariaLabel
}: TagProps) => {
  const variantClasses = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    primary: 'bg-accent-100 text-accent-800 dark:bg-accent-900/30 dark:text-accent-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  };

  // Match Input size padding patterns
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-0.5 text-xs gap-1.5',
    lg: 'px-3 py-1 text-sm gap-2'
  };

  // RemoveButton size mapping
  const removeButtonSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

  const tagText = typeof children === 'string' ? children : 'tag';
  const removeAriaLabel = `Remove ${tagText}`;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        variantClasses[variant],
        sizeClasses[size],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-label={ariaLabel}
    >
      <span className="flex-shrink-0">{children}</span>
      {onRemove && !disabled && (
        <span className="flex-shrink-0 -mr-1">
          <RemoveButton
            onClick={onRemove}
            size={removeButtonSize}
            aria-label={removeAriaLabel}
            className="min-w-[32px] min-h-[32px]"
          />
        </span>
      )}
    </span>
  );
};

