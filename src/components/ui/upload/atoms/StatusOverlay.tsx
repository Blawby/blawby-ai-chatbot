/**
 * StatusOverlay - Atom Component
 * 
 * Pure status indicator overlay. Shows checkmark, spinner, or nothing.
 * No file-specific logic, just status display.
 */

import { cn } from '../../../../utils/cn';
import { LoadingSpinner } from '../../layout/LoadingSpinner';

export type StatusType = 'uploading' | 'completed' | 'processing' | 'analyzing' | 'none';

interface StatusOverlayProps {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusOverlay = ({ 
  status, 
  size = 'md',
  className 
}: StatusOverlayProps) => {
  if (status === 'none') return null;

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const overlayClasses = {
    uploading: 'bg-black/20',
    completed: 'bg-green-500/20',
    processing: 'bg-yellow-500/20',
    analyzing: 'bg-purple-500/20'
  };

  return (
    <div className={cn(
      'absolute inset-0 flex items-center justify-center',
      overlayClasses[status],
      className
    )}>
      
      {status === 'completed' && (
        <svg 
          className={cn('text-green-500', sizeClasses[size])} 
          fill="currentColor" 
          viewBox="0 0 20 20"
          role="img"
          aria-label="Upload completed"
        >
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      
      {status === 'processing' && (
        <LoadingSpinner 
          size={size} 
          ariaLabel="Processing document" 
        />
      )}
      
      {status === 'analyzing' && (
        <LoadingSpinner 
          size={size} 
          ariaLabel="Analyzing document" 
        />
      )}
    </div>
  );
};
