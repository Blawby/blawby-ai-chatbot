/**
 * ToastIcon - Atom Component
 * 
 * Icon component for different toast types with appropriate styling.
 */

import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { cn } from '../../../../utils/cn';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastIconProps {
  type: ToastType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ToastIcon = ({ 
  type, 
  size = 'md',
  className 
}: ToastIconProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className={cn('text-green-500', sizeClasses[size])} />;
      case 'error':
        return <ExclamationTriangleIcon className={cn('text-red-500', sizeClasses[size])} />;
      case 'warning':
        return <ExclamationTriangleIcon className={cn('text-yellow-500', sizeClasses[size])} />;
      case 'info':
      default:
        return <InformationCircleIcon className={cn('text-blue-500', sizeClasses[size])} />;
    }
  };

  return (
    <div className={cn('flex-shrink-0', className)} aria-hidden="true">
      {getIcon()}
    </div>
  );
};
