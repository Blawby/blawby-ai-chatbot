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
    error: 'status-error',
    success: 'status-success',
    warning: 'status-warning',
    info: 'status-info'
  };

  return (
    <p 
      id={id}
      role="alert"
      aria-live="polite"
      className={cn(
        'text-xs mt-1 p-2 rounded',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </p>
  );
};
