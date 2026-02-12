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
  <div className={cn('border-t border-line-glass/30 bg-transparent', className)}>
    {children}
  </div>
);
