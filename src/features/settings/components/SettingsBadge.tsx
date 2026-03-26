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
    success: 'status-success',
    warning: 'status-warning',
    info: 'status-info'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
};
