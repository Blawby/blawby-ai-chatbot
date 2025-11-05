/**
 * OnboardingContainer - Organism Component
 * 
 * Full-screen layout wrapper for onboarding flows.
 * Handles layout, error display, and loading states.
 */

import { ValidationAlert } from '../atoms/ValidationAlert';
import { LoadingSpinner } from '../../ui/layout/LoadingSpinner';
import { cn } from '../../../utils/cn';
import type { ComponentChildren } from 'preact';

interface OnboardingContainerProps {
  children: ComponentChildren;
  header: ComponentChildren;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

export const OnboardingContainer = ({
  children,
  header,
  loading = false,
  error = null,
  className = ''
}: OnboardingContainerProps) => {
  return (
    <div className={cn('min-h-screen bg-light-bg dark:bg-dark-bg py-12 sm:px-6 lg:px-8', className)}>
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        {header}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white dark:bg-dark-card-bg border border-gray-200 dark:border-white/10 py-8 px-5 sm:px-10 shadow-lg sm:rounded-xl">
          {error && (
            <ValidationAlert type="error" className="mb-6">
              {error}
            </ValidationAlert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner size="lg" ariaLabel="Loading onboarding step" />
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
};
