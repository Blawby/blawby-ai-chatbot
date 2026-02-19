import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface FormMessageProps {
  children?: ComponentChildren;
  className?: string;
  variant?: 'error' | 'success' | 'warning' | 'info';
  id?: string;
}

export const FormMessage = ({
  children,
  className = '',
  variant = 'error',
  id
}: FormMessageProps) => {
  if (!children) return null;

  const variantClasses = {
    error: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-accent-600 dark:text-accent-400'
  };

  return (
    <p 
      id={id}
      role="alert"
      aria-live="polite"
      className={cn(
        'text-xs mt-1',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </p>
  );
};
