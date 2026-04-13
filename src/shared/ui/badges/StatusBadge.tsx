import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type StatusVariant = 'active' | 'pending' | 'inactive' | 'suspended' | 'cancelled' | 'completed' | 'warning' | 'error' | 'info' | 'success' | 'lead' | 'archived';

const STATUS_CLASSES: Record<StatusVariant, string> = {
 active: 'status-success',
 pending: 'status-warning',
 inactive: 'glass-input text-input-placeholder',
 suspended: 'status-error',
 cancelled: 'status-error',
 completed: 'status-info',
 success: 'status-success',
 warning: 'status-warning',
 error: 'status-error',
 info: 'status-info',
 lead: 'status-info',
 archived: 'glass-input text-input-placeholder'
};

interface StatusBadgeProps {
 status: StatusVariant;
 children?: ComponentChildren;
 className?: string;
}

export const StatusBadge = ({ status, children, className }: StatusBadgeProps) => {
 return (
  <span
   className={cn(
    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
    STATUS_CLASSES[status],
    className
   )}
  >
   {children || status.charAt(0).toUpperCase() + status.slice(1)}
  </span>
 );
};
