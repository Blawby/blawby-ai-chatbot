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
    warning: 'bg-[rgb(var(--warning-foreground))]/10 border border-[rgb(var(--warning-foreground))]/20 text-[rgb(var(--warning-foreground))] dark:bg-[rgb(var(--warning-foreground))]/20 dark:border-[rgb(var(--warning-foreground))]/30',
    danger: 'bg-[rgb(var(--error-foreground))]/10 border border-[rgb(var(--error-foreground))]/20 text-[rgb(var(--error-foreground))] dark:bg-[rgb(var(--error-foreground))]/20 dark:border-[rgb(var(--error-foreground))]/30'
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
