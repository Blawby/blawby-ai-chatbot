import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface IconContainerProps {
  children: ComponentChildren;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const IconContainer = ({
  children,
  className = '',
  size = 'md'
}: IconContainerProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div className={cn(
      'text-gray-400 dark:text-gray-500 flex-shrink-0 flex items-start justify-center pt-2',
      sizeClasses[size],
      className
    )}>
      {children}
    </div>
  );
};
