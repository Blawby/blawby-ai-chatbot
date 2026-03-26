import { ComponentChildren } from 'preact';
import type { JSX } from 'preact';
import { cn } from '@/shared/utils/cn';

type SettingsNoticeVariant = 'info' | 'warning' | 'danger';

export interface SettingsNoticeProps {
  children: ComponentChildren;
  variant?: SettingsNoticeVariant;
  className?: string;
  role?: JSX.AriaRole;
  'aria-live'?: 'off' | 'polite' | 'assertive';
}

export const SettingsNotice = ({
  children,
  variant = 'info',
  className = '',
  role,
  'aria-live': ariaLive
}: SettingsNoticeProps) => {
  const variantClasses: Record<SettingsNoticeVariant, string> = {
  info: 'glass-panel text-input-text',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
    danger: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
  };

  return (
    <div
      className={cn('rounded-lg p-3 text-sm', variantClasses[variant], className)}
      role={role}
      aria-live={ariaLive}
    >
      {children}
    </div>
  );
};
