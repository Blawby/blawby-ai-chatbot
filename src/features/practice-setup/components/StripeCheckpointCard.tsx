import { Button } from '@/shared/ui/Button';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';

interface StripeCheckpointCardProps {
  businessOnboardingStatus?: BusinessOnboardingStatus | null;
  onConnect: () => void | Promise<void>;
  isLoading?: boolean;
}

export function StripeCheckpointCard({
  businessOnboardingStatus,
  onConnect,
  isLoading = false,
}: StripeCheckpointCardProps) {
  if (
    businessOnboardingStatus === 'completed' ||
    businessOnboardingStatus === 'not_required' ||
    businessOnboardingStatus === 'skipped'
  ) {
    return null;
  }

  const isInProgress = businessOnboardingStatus === 'pending';
  const title = isInProgress ? 'Finish your Stripe setup' : 'Set up payouts to get paid';
  const body = isInProgress
    ? "Your Stripe setup isn't complete yet. Pick up where you left off so payouts can be enabled."
    : 'Connect your bank account with Stripe so you can accept payments and receive payouts.';
  const ctaLabel = isInProgress ? 'Continue in Stripe' : 'Connect Stripe';
  const statusLabel = isInProgress ? 'In progress' : 'Not started';

  return (
    <div className="glass-card mt-4 space-y-4 border border-line-glass/40 p-4 text-input-text">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-500/12 text-lg text-[rgb(var(--accent-foreground))]">
          $
        </div>
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-semibold">{title}</div>
          <p className="text-sm text-input-placeholder">{body}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line-glass/30 bg-surface-utility/10 px-3 py-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-input-placeholder">Stripe status</div>
          <div className="text-sm font-medium">{statusLabel}</div>
        </div>
        <Button variant="primary" size="sm" onClick={onConnect} disabled={isLoading}>
          {isLoading ? 'Preparing Stripe...' : ctaLabel}
        </Button>
      </div>
    </div>
  );
}
