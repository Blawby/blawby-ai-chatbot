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
  <div className={cn('glass-panel', className)}>
    {children}
  </div>
);
