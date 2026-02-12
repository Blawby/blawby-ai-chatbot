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
  <div className={cn('rounded-2xl border border-line-default bg-surface-card shadow-card', className)}>
    {children}
  </div>
);
