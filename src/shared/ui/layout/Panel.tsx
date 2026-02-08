import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface PanelProps {
  children: ComponentChildren;
  className?: string;
}

export const Panel = ({
  children,
  className
}: PanelProps) => (
  <div className={cn('rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg', className)}>
    {children}
  </div>
);
