import { ComponentChildren } from 'preact';
import type { JSX } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface SettingsHelperTextProps extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'className'> {
  children: ComponentChildren;
  className?: string;
}

export const SettingsHelperText = ({
  children,
  className = '',
  ...rest
}: SettingsHelperTextProps) => {
  return (
    <span className={cn('text-xs text-gray-500 dark:text-gray-400', className)} {...rest}>
      {children}
    </span>
  );
};
