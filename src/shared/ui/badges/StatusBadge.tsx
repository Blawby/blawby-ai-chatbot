import type { ComponentChildren } from 'preact';

type Status = 'active' | 'pending' | 'inactive' | 'suspended' | 'cancelled' | 'completed';

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
};

interface StatusBadgeProps {
  status: Status;
  children?: ComponentChildren;
  className?: string;
}

export const StatusBadge = ({ status, children, className }: StatusBadgeProps) => {
  const statusStyles = STATUS_STYLES[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  const combinedClasses = className ? `${baseClasses} ${statusStyles} ${className}` : `${baseClasses} ${statusStyles}`;
  
  return (
    <span className={combinedClasses}>
      {children || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};
