/**
 * CloseButton - Atom Component
 * 
 * Standalone close button for toasts with proper ARIA labels.
 * Follows the pattern from RemoveButton.tsx.
 */

import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from '../../../../utils/cn';

interface CloseButtonProps {
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

export const CloseButton = ({ 
  onClick, 
  disabled = false,
  size = 'md',
  className,
  'aria-label': ariaLabel = 'Close notification'
}: CloseButtonProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };
  
  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-4 h-4'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex text-gray-400 dark:text-gray-500',
        'hover:text-gray-600 dark:hover:text-gray-300',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500',
        'dark:focus:ring-offset-gray-800 rounded-md',
        'transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        className
      )}
      aria-label={ariaLabel}
      type="button"
    >
      <XMarkIcon className={cn(iconSizeClasses[size])} />
    </button>
  );
};
