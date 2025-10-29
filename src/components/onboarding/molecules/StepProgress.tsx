/**
 * StepProgress - Molecule Component
 * 
 * Current step indicator with progress information.
 * Combines step indicator with progress text.
 */

import { StepIndicator } from '../atoms/StepIndicator';
import { cn } from '../../../utils/cn';

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  variant?: 'dots' | 'numbers';
  showText?: boolean;
  className?: string;
}

export const StepProgress = ({
  currentStep,
  totalSteps,
  variant = 'dots',
  showText = true,
  className = ''
}: StepProgressProps) => {
  return (
    <div className={cn('flex items-center justify-center gap-4', className)}>
      <StepIndicator
        currentStep={currentStep}
        totalSteps={totalSteps}
        variant={variant}
        size="md"
      />
      {showText && (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Step {currentStep} of {totalSteps}
        </span>
      )}
    </div>
  );
};
