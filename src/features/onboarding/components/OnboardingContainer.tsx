/**
 * OnboardingContainer - Organism Component
 * 
 * Full-screen layout wrapper for onboarding flows.
 * Handles layout, error display, and loading states.
 */

import { ValidationAlert } from './ValidationAlert';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { cn } from '@/shared/utils/cn';
import type { ComponentChildren } from 'preact';

interface OnboardingContainerProps {
  children: ComponentChildren;
  header: ComponentChildren;
  loading?: boolean;
  error?: string | null;
  className?: string;
  footer?: ComponentChildren;
  footerSticky?: boolean;
}

export const OnboardingContainer = ({
  children,
  header,
  loading = false,
  error = null,
  className = '',
  footer,
  footerSticky = true
}: OnboardingContainerProps) => {
  return (
    <div className={cn('min-h-screen bg-light-bg dark:bg-dark-bg py-12 sm:px-6 lg:px-8 flex flex-col', className)}>
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl w-full flex-1 flex flex-col">
        {header}

        <div className="mt-8 flex-1 flex flex-col">
          <div className="bg-white dark:bg-dark-card-bg border border-gray-200 dark:border-white/10 shadow-lg sm:rounded-xl flex flex-col h-full">
            <div className="flex-1 overflow-y-auto pb-24 px-5 sm:px-10 py-8">
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
      </div>

      {footer && (
        <div className={cn('w-full sm:mx-auto sm:w-full sm:max-w-2xl', footerSticky ? 'sticky bottom-0 z-20' : '')}>
          <div className="bg-white dark:bg-dark-card-bg border-t border-gray-200 dark:border-white/10 px-5 sm:px-10 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
            {footer}
          </div>
        </div>
      )}
    </div>
  );
};
