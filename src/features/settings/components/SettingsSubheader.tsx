import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface SettingsSubheaderProps {
  children: ComponentChildren;
  className?: string;
  variant?: 'default' | 'section';
}

export const SettingsSubheader = ({
  children,
  className = '',
  variant = 'default'
}: SettingsSubheaderProps) => {
  const variantClasses = {
    default: 'text-[11px] font-semibold uppercase tracking-wide text-input-placeholder',
    section: 'text-sm font-semibold text-input-text'
  };

  return (
    <div className={cn(
      variantClasses[variant],
      className
    )}>
      {children}
    </div>
  );
};
