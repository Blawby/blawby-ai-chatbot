/**
 * StepIndicator - Atom Component
 * 
 * Pure step progress indicator. No state, just visual display.
 * Can show dots or numbers based on variant.
 */

import { cn } from '../../../utils/cn';

export type StepIndicatorVariant = 'dots' | 'numbers';
export type StepIndicatorSize = 'sm' | 'md' | 'lg';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  variant?: StepIndicatorVariant;
  size?: StepIndicatorSize;
  className?: string;
}

export const StepIndicator = ({
  currentStep,
  totalSteps,
  variant = 'dots',
  size = 'md',
  className = ''
}: StepIndicatorProps) => {
  const totalStepsClamped = Math.max(0, totalSteps);
  const currentIndex = totalStepsClamped > 0
    ? Math.min(Math.max(0, (currentStep ?? 0) - 1), totalStepsClamped - 1)
    : 0;

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const spacingClasses = {
    sm: 'gap-1',
    md: 'gap-2',
    lg: 'gap-3'
  };

  if (variant === 'numbers') {
    return (
      <div className={cn('flex items-center', spacingClasses[size], className)}>
        <span className={cn('font-medium text-gray-500 dark:text-gray-400', textSizeClasses[size])}>
          {totalStepsClamped > 0 ? currentIndex + 1 : 0} of {totalStepsClamped}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center', spacingClasses[size], className)}>
      {Array.from({ length: totalStepsClamped }, (_, index) => {
        const stepNumber = index + 1;
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        
        return (
          <div
            key={index}
            className={cn(
              'rounded-full transition-colors',
              sizeClasses[size],
              isActive && 'bg-accent-500',
              isCompleted && 'bg-green-500',
              !isActive && !isCompleted && 'bg-gray-300 dark:bg-gray-600'
            )}
            aria-label={`Step ${stepNumber}${isActive ? ', current' : isCompleted ? ', completed' : ''}`}
            aria-current={isActive ? 'step' : undefined}
          />
        );
      })}
    </div>
  );
};
