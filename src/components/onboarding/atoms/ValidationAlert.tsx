/**
 * ValidationAlert - Atom Component
 * 
 * Pure validation error/warning display. No state, just visual display.
 */

import { cn } from '../../../utils/cn';
import type { ComponentChildren } from 'preact';

export type ValidationAlertType = 'error' | 'warning' | 'info' | 'success';

interface ValidationAlertProps {
  children: ComponentChildren;
  type?: ValidationAlertType;
  className?: string;
  'aria-live'?: 'off' | 'polite' | 'assertive';
}

export const ValidationAlert = ({
  children,
  type = 'error',
  className = '',
  'aria-live': ariaLive = 'assertive'
}: ValidationAlertProps) => {
  const typeClasses = {
    error: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    warning: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
    info: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    success: 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20 text-green-700 dark:text-green-300'
  };

  return (
    <div
      className={cn(
        'rounded-md border p-4 text-sm',
        typeClasses[type],
        className
      )}
      role="alert"
      aria-live={ariaLive}
    >
      {children}
    </div>
  );
};
