/**
 * OnboardingHeader - Molecule Component
 * 
 * Combines Logo, title, description, and optional step progress.
 * Handles header layout and styling.
 */

import { Logo } from '../../ui/Logo';
import { StepIndicator } from '../atoms/StepIndicator';
import { cn } from '../../../utils/cn';

interface OnboardingHeaderProps {
  title: string;
  description: string;
  currentStep?: number;
  totalSteps?: number;
  showProgress?: boolean;
  className?: string;
}

export const OnboardingHeader = ({
  title,
  description,
  currentStep,
  totalSteps,
  showProgress = false,
  className = ''
}: OnboardingHeaderProps) => {
  return (
    <div className={cn('text-center', className)}>
      <div className="flex justify-center mb-6">
        <Logo size="lg" />
      </div>
      
      <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
        {title}
      </h2>
      
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>
      
      {showProgress && currentStep && totalSteps && (
        <div className="mt-4 flex justify-center">
          <StepIndicator
            currentStep={currentStep}
            totalSteps={totalSteps}
            variant="dots"
            size="md"
          />
        </div>
      )}
    </div>
  );
};
