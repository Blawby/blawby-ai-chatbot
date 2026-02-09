import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

type SettingsBadgeVariant = 'success' | 'warning' | 'info';

export interface SettingsBadgeProps {
  children: ComponentChildren;
  variant?: SettingsBadgeVariant;
  className?: string;
}

export const SettingsBadge = ({
  children,
  variant = 'info',
  className = ''
}: SettingsBadgeProps) => {
  const variantClasses: Record<SettingsBadgeVariant, string> = {
    success: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
      variantClasses[variant],
      className
    )}>
      {children}
    </span>
  );
};
