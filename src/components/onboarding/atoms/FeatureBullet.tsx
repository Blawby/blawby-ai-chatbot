/**
 * FeatureBullet - Atom Component
 * 
 * Pure feature bullet point with icon and text.
 * No state, just visual display.
 */

import { cn } from '../../../utils/cn';
import type { ComponentChildren } from 'preact';

export type FeatureBulletVariant = 'default' | 'success' | 'warning' | 'info';
export type FeatureBulletSize = 'sm' | 'md' | 'lg';

interface FeatureBulletProps {
  children: ComponentChildren;
  icon?: ComponentChildren;
  variant?: FeatureBulletVariant;
  size?: FeatureBulletSize;
  className?: string;
}

export const FeatureBullet = ({
  children,
  icon,
  variant = 'default',
  size = 'md',
  className = ''
}: FeatureBulletProps) => {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const variantClasses = {
    default: 'text-accent-500',
    success: 'text-green-500',
    warning: 'text-amber-500',
    info: 'text-blue-500'
  };

  const defaultIcon = variant === 'success' ? '✅' : '•';

  return (
    <li className={cn('flex items-start gap-3', className)}>
      <span className={cn(
        'mt-0.5 leading-none flex-shrink-0',
        variantClasses[variant],
        sizeClasses[size]
      )}>
        {icon || defaultIcon}
      </span>
      <span className={cn(
        'text-gray-600 dark:text-gray-300',
        sizeClasses[size]
      )}>
        {children}
      </span>
    </li>
  );
};
