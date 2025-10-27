/**
 * ToastMessage - Atom Component
 * 
 * Styled message text component for toasts.
 */

import { ComponentChildren } from 'preact';
import { cn } from '../../../../utils/cn';

interface ToastMessageProps {
  children: ComponentChildren;
  className?: string;
}

export const ToastMessage = ({ 
  children, 
  className 
}: ToastMessageProps) => {
  return (
    <p className={cn(
      'mt-1 text-sm text-gray-600 dark:text-gray-300',
      className
    )}>
      {children}
    </p>
  );
};
