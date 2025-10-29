/**
 * OnboardingActions - Molecule Component
 * 
 * Combines Button components for navigation.
 * Handles button states and labels based on step position.
 */

import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';

interface OnboardingActionsProps {
  onBack?: () => void;
  onContinue: () => void;
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
    <div className={cn('space-y-3', className)}>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onContinue}
        disabled={loading}
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          getContinueLabel()
        )}
      </Button>
      
      {onBack && (
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={onBack}
          disabled={loading}
        >
          {getBackLabel()}
        </Button>
      )}
    </div>
  );
};
