import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';

interface StageFooterProps {
  /** Skip handler — when omitted, the skip link is hidden. */
  onSkip?: () => void;
  /** Back handler — when omitted, the Back button is hidden (step 1). */
  onBack?: () => void;
  /** Continue handler — required. */
  onContinue: () => void;
  /** Continue label — e.g. "Continue → Connect Stripe". */
  continueLabel: string;
  /** Disables the Continue button (failed per-step validation). */
  continueDisabled?: boolean;
  /** Shows a spinner inside the Continue button. */
  isSubmitting?: boolean;
  /** Optional aria-label for the skip link. */
  skipLabel?: string;
}

/**
 * Stage bottom-action row for each onboarding step (Onboarding.html `.stage-foot`).
 *
 * Left: dotted-underline skip link. Right: Back (ghost) + Continue (primary).
 */
export const StageFooter = ({
  onSkip,
  onBack,
  onContinue,
  continueLabel,
  continueDisabled = false,
  isSubmitting = false,
  skipLabel = "Skip — I'll set this up later"
}: StageFooterProps) => {
  return (
    <div
      className="mt-auto flex items-center justify-between gap-4 pt-6"
      style={{ borderTop: '1px solid var(--rule)' }}
    >
      {onSkip ? (
        <button
          type="button"
          onClick={onSkip}
          disabled={isSubmitting}
          className="bg-transparent border-0 cursor-pointer py-1"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--dim)',
            borderBottom: '1px dotted var(--dim-2)',
            padding: '4px 0'
          }}
        >
          {skipLabel}
        </button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-2.5">
        {onBack && (
          <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
            Back
          </Button>
        )}
        <Button
          variant="primary"
          onClick={onContinue}
          disabled={continueDisabled || isSubmitting}
        >
          {isSubmitting ? (
            <LoadingSpinner size="md" ariaLabel="Working" />
          ) : (
            continueLabel
          )}
        </Button>
      </div>
    </div>
  );
};

export default StageFooter;
