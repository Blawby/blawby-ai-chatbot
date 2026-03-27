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
    default: 'text-xs font-medium text-input-placeholder tracking-tight',
    section: 'text-base font-semibold text-input-text pt-4 pb-2'
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
