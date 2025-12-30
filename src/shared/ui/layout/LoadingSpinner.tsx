import { cn } from '@/shared/utils/cn';

export interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
  role?: 'status' | 'progressbar' | 'alert';
  ariaLive?: 'off' | 'polite' | 'assertive';
  ariaHidden?: boolean;
}

export const LoadingSpinner = ({
  className = '',
  size = 'md',
  ariaLabel = 'Loading',
  role = 'status',
  ariaLive = 'polite',
  ariaHidden = false
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div 
      className={cn(
        'border-2 border-current border-t-transparent rounded-full animate-spin',
        sizeClasses[size],
        className
      )}
      role={role}
      aria-label={ariaLabel}
      aria-live={ariaLive}
      aria-hidden={ariaHidden}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};
