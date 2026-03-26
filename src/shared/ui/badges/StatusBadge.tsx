import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

type Status = 'active' | 'pending' | 'inactive' | 'suspended' | 'cancelled' | 'completed';

const STATUS_CLASSES: Record<Status, string> = {
  active: 'status-success',
  pending: 'status-warning',
  inactive: 'glass-input text-input-placeholder',
  suspended: 'status-error',
  cancelled: 'status-error',
  completed: 'status-info'
};

interface StatusBadgeProps {
  status: Status;
  children?: ComponentChildren;
  className?: string;
}

export const StatusBadge = ({ status, children, className }: StatusBadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        STATUS_CLASSES[status] ?? 'status-info',
        className
      )}
    >
      {children || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};
