/**
 * ChecklistItem - Atom Component
 * 
 * Pure checklist item with checkmark and text.
 * No state, just visual display.
 */

import { cn } from '../../../utils/cn';
import type { ComponentChildren } from 'preact';

export type ChecklistItemStatus = 'completed' | 'pending' | 'incomplete';
export type ChecklistItemSize = 'sm' | 'md' | 'lg';

interface ChecklistItemProps {
  children: ComponentChildren;
  status?: ChecklistItemStatus;
  size?: ChecklistItemSize;
  className?: string;
}

export const ChecklistItem = ({
  children,
  status = 'pending',
  size = 'md',
  className = ''
}: ChecklistItemProps) => {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const statusClasses = {
    completed: 'text-green-500',
    pending: 'text-gray-400',
    incomplete: 'text-gray-300'
  };

  const getIcon = () => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'pending':
        return '⏳';
      case 'incomplete':
        return '❌';
      default:
        return '⏳';
    }
  };

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className={cn(
        'mt-0.5 leading-none flex-shrink-0',
        statusClasses[status],
        sizeClasses[size]
      )}>
        <span className="sr-only">{status}</span>
        <span aria-hidden="true">{getIcon()}</span>
      </span>
      <span className={cn(
        'text-gray-600 dark:text-gray-300',
        sizeClasses[size]
      )}>
        {children}
      </span>
    </div>
  );
};
