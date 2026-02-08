import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface BottomBarProps {
  children: ComponentChildren;
  className?: string;
}

export const BottomBar = ({
  children,
  className
}: BottomBarProps) => (
  <div className={cn('border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg', className)}>
    {children}
  </div>
);
