/**
 * InfoCard - Atom Component
 * 
 * Pure info card with icon, title, and content.
 * No state, just visual display.
 */

import { cn } from '@/shared/utils/cn';
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
    default: 'border-line-glass/30 bg-white/5 text-input-text backdrop-blur-md',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100 backdrop-blur-md',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100 backdrop-blur-md',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 backdrop-blur-md',
    red: 'border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-100 backdrop-blur-md'
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
