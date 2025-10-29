/**
 * InfoCard - Atom Component
 * 
 * Pure info card with icon, title, and content.
 * No state, just visual display.
 */

import { cn } from '../../../utils/cn';
import type { ComponentChildren } from 'preact';

export type InfoCardVariant = 'default' | 'blue' | 'amber' | 'green' | 'red';
export type InfoCardSize = 'sm' | 'md' | 'lg';

interface InfoCardProps {
  children: ComponentChildren;
  title?: string;
  icon?: ComponentChildren;
  variant?: InfoCardVariant;
  size?: InfoCardSize;
  className?: string;
}

export const InfoCard = ({
  children,
  title,
  icon,
  variant = 'default',
  size = 'md',
  className = ''
}: InfoCardProps) => {
  const sizeClasses = {
    sm: 'p-3 text-xs',
    md: 'p-4 text-sm',
    lg: 'p-6 text-base'
  };

  const titleSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const iconSizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  const variantClasses = {
    default: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
    blue: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200',
    amber: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200',
    green: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 text-green-800 dark:text-green-200',
    red: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 text-red-800 dark:text-red-200'
  };

  return (
    <div className={cn(
      'rounded-lg border',
      variantClasses[variant],
      sizeClasses[size],
      className
    )}>
      {(title || icon) && (
        <div className="flex items-start gap-3 mb-3">
          {icon && (
            <div className={cn(
              'flex-shrink-0 flex items-center justify-center',
              iconSizeClasses[size]
            )}>
              {icon}
            </div>
          )}
          {title && (
            <h3 className={cn(
              'font-medium',
              titleSizeClasses[size]
            )}>
              {title}
            </h3>
          )}
        </div>
      )}
      <div className={size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'}>
        {children}
      </div>
    </div>
  );
};
