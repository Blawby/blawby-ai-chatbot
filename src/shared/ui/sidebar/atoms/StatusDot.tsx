/**
 * StatusDot - Atom Component
 * 
 * Pure status indicator dot. No interactions, no state.
 * Just renders a colored dot based on status.
 */

import { MatterStatus } from '@/shared/types/matter';

interface StatusDotProps {
  status?: MatterStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusDot = ({ 
  status, 
  size = 'md',
  className = ''
}: StatusDotProps) => {
  const getBadgeColor = (status?: MatterStatus) => {
    switch (status) {
      case 'ready':
        return 'bg-green-500';
      case 'incomplete':
        return 'bg-orange-500';
      case 'empty':
      default:
        return 'bg-gray-400';
    }
  };

  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3'
  };

  if (!status || status === 'empty') {
    return null;
  }

  return (
    <div 
      className={`absolute top-1 right-1 ${sizeClasses[size]} rounded-full ${getBadgeColor(status)} ${className}`}
      aria-hidden="true"
    />
  );
};
