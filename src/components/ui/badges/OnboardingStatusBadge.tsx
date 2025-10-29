/**
 * OnboardingStatusBadge - Atom Component
 * 
 * Pure onboarding status badge display.
 * Follows StatusBadge and TierBadge patterns.
 */

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';
import type { ComponentChildren } from 'preact';

export type OnboardingStatus = 'completed' | 'pending' | 'incomplete';
export type OnboardingStatusVariant = 'compact' | 'detailed';

interface OnboardingStatusBadgeProps {
  status: OnboardingStatus;
  variant?: OnboardingStatusVariant;
  onClick?: () => void;
  className?: string;
  children?: ComponentChildren;
}

export const OnboardingStatusBadge = ({ 
  status, 
  variant = 'compact',
  onClick,
  className = '',
  children 
}: OnboardingStatusBadgeProps) => {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors flex-shrink-0';
  
  const statusClasses = {
    completed: 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600',
    pending: 'text-amber-600 dark:text-amber-400 bg-transparent border border-amber-300 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20',
    incomplete: 'text-red-600 dark:text-red-400 bg-transparent border border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
  };
  
  const hoverClasses = onClick ? 'cursor-pointer hover:opacity-80' : '';
  const combinedClasses = cn(
    baseClasses,
    statusClasses[status],
    hoverClasses,
    className
  );
  
  const getContent = () => {
    if (children) return children;
    
    if (variant === 'compact') {
      return (
        <>
          {status !== 'completed' && <ExclamationTriangleIcon className="w-3 h-3 mr-1" />}
          Setup
        </>
      );
    } else {
      const labels = {
        completed: 'Setup complete',
        pending: 'Setup needed',
        incomplete: 'Setup required'
      };
      return labels[status];
    }
  };
  
  const content = getContent();
  const title = status === 'completed' ? 'Business setup complete' : 'Complete business setup';
  
  if (onClick) {
    return (
      <button
        className={combinedClasses}
        onClick={onClick}
        type="button"
        title={title}
        data-testid="onboarding-status-badge"
      >
        {content}
      </button>
    );
  }
  
  return (
    <span 
      className={combinedClasses}
      title={title}
      data-testid="onboarding-status-badge"
    >
      {content}
    </span>
  );
};
