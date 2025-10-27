/**
 * ToastTitle - Atom Component
 * 
 * Styled title text component for toasts.
 */

import { ComponentChildren } from 'preact';
import { cn } from '../../../../utils/cn';

interface ToastTitleProps {
  children: ComponentChildren;
  className?: string;
}

export const ToastTitle = ({ 
  children, 
  className 
}: ToastTitleProps) => {
  return (
    <h3 className={cn(
      'text-sm font-medium text-gray-900 dark:text-gray-100',
      className
    )}>
      {children}
    </h3>
  );
};
