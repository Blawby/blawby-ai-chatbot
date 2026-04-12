import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface PanelEmptyStateProps {
  message: string;
  children?: ComponentChildren;
  className?: string;
}

/**
 * Standard empty state for Matter detail sub-panels.
 */
export const PanelEmptyState = ({
  message,
  children,
  className
}: PanelEmptyStateProps) => (
  <div className={cn('px-6 py-8 text-center sm:text-left', className)}>
    <p className="text-sm text-input-placeholder">
      {message}
    </p>
    {children && <div className="mt-3">{children}</div>}
  </div>
);
