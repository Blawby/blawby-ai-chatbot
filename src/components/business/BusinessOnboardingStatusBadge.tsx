import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { ComponentChildren } from 'preact';

interface BusinessOnboardingStatusBadgeProps {
  completed: boolean;
  onClick?: () => void;
  variant?: 'compact' | 'detailed';
  className?: string;
  children?: ComponentChildren;
}

export const BusinessOnboardingStatusBadge = ({ 
  completed, 
  onClick, 
  variant = 'compact',
  className = '',
  children 
}: BusinessOnboardingStatusBadgeProps) => {
  // Determine styling based on completion status
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors flex-shrink-0';
  
  const incompleteClasses = 'text-amber-600 dark:text-amber-400 bg-transparent border border-amber-300 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20';
  const completeClasses = 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600';
  
  const statusClasses = completed ? completeClasses : incompleteClasses;
  const combinedClasses = `${baseClasses} ${statusClasses} ${className}`;
  
  // Determine content based on variant
  const getContent = () => {
    if (children) return children;
    
    if (variant === 'compact') {
      return (
        <>
          {!completed && <ExclamationTriangleIcon className="w-3 h-3 mr-1" />}
          Setup
        </>
      );
    } else {
      return completed ? 'Setup complete' : 'Setup needed';
    }
  };
  
  const content = getContent();
  const title = completed ? 'Business setup complete' : 'Complete business setup';
  
  if (onClick) {
    return (
      <button
        className={`${combinedClasses} cursor-pointer`}
        onClick={onClick}
        type="button"
        title={title}
        data-testid="business-onboarding-status"
      >
        {content}
      </button>
    );
  }
  
  return (
    <span 
      className={combinedClasses}
      title={title}
      data-testid="business-onboarding-status"
    >
      {content}
    </span>
  );
};
