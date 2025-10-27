/**
 * ToastCard - Molecule Component
 * 
 * Wraps toast content with styling and background colors.
 * Handles the visual appearance of the toast card.
 */

import { ComponentChildren } from 'preact';
import { ToastType } from '../atoms/ToastIcon';
import { cn } from '../../../../utils/cn';

interface ToastCardProps {
  type: ToastType;
  children: ComponentChildren;
  className?: string;
}

export const ToastCard = ({ 
  type, 
  children, 
  className 
}: ToastCardProps) => {
  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'info':
      default:
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div className={cn(
      'max-w-sm w-full border rounded-lg shadow-lg p-4 relative',
      getBackgroundColor(),
      className
    )}>
      {children}
    </div>
  );
};
