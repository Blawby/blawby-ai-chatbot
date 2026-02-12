/**
 * RemoveButton - Atom Component
 * 
 * Pure remove button. No file-specific logic.
 * Just renders a remove button with consistent styling.
 */

import { cn } from '@/shared/utils/cn';

interface RemoveButtonProps {
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

export const RemoveButton = ({ 
  onClick, 
  disabled = false,
  size = 'md',
  className,
  'aria-label': ariaLabel = 'Remove'
}: RemoveButtonProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };
  
  const iconSizeClasses = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-shrink-0 rounded-full',
        'flex items-center justify-center',
        'bg-red-500/40 hover:bg-red-500/50',
        'transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        className
      )}
      aria-label={ariaLabel}
      type="button"
    >
      <svg className={cn('text-white', iconSizeClasses[size])} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
};
