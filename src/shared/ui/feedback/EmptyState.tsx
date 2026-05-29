import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface EmptyStateProps {
  icon?: ComponentChildren;
  title: string;
  description?: string;
  action?: ComponentChildren;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && (
        <div className="mb-4 text-dim-2/60">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-ink mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-dim-2 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
