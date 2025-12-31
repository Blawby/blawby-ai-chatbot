/**
 * OnboardingActions - Molecule Component
 * 
 * Combines Button components for navigation.
 * Handles button states and labels based on step position.
 */

import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

export interface OnboardingActionsProps {
  onBack?: () => void;
  onContinue: () => void;
  onSkip?: () => void;
  backLabel?: string;
  continueLabel?: string;
  loading?: boolean;
  isFirstStep?: boolean;
  isLastStep?: boolean;
  className?: string;
}

export const OnboardingActions = ({
  onBack,
  onContinue,
  onSkip,
  backLabel = 'Back',
  continueLabel = 'Continue',
  loading = false,
  isFirstStep = false,
  isLastStep = false,
  className = ''
}: OnboardingActionsProps) => {
  const getContinueLabel = () => {
    if (loading) return '';
    if (isLastStep) return 'Launch Assistant';
    return continueLabel;
  };

  const getBackLabel = () => {
    if (isFirstStep) return 'Cancel';
    return backLabel;
  };

  return (
    <div className={cn('space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3', className)}>
      {onBack && (
        <Button
          variant="secondary"
          size="lg"
          className="w-full order-2 sm:order-1"
          onClick={onBack}
          disabled={loading}
        >
          {getBackLabel()}
        </Button>
      )}

      <Button
        variant="primary"
        size="lg"
        className={cn('w-full', onBack ? 'order-1 sm:order-2' : '')}
        onClick={onContinue}
        disabled={loading}
        aria-disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <div
            className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">Loading...</span>
          </div>
        ) : (
          getContinueLabel() || 'Continue'
        )}
      </Button>

      {onSkip && (
        <div className="col-span-2 text-center mt-2 order-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={loading}
            aria-disabled={loading}
            aria-busy={loading}
            className={cn(
              'text-sm font-bold underline',
              loading && 'opacity-50 cursor-not-allowed no-underline pointer-events-none'
            )}
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
};
