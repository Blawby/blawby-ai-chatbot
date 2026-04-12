/**
 * PendingReviewCard
 *
 * Displayed in the widget chat view after a successful intake submission while
 * the conversation is in the `pending_review` step.  It replaces the empty /
 * disabled composer state with a clear, reassuring surface that:
 *  - Confirms the intake was received
 *  - Sets expectations about next steps (practice will follow up)
 *
 * Intentionally stateless — all data comes from props.
 */

import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface PendingReviewCardProps {
  /** Name of the practice — shown in the confirmation copy. */
  practiceName?: string | null;
  /** ISO timestamp of submission — shown as absolute date. */
  submittedAt?: string | null;
  /** Whether a payment is still outstanding (changes the copy slightly). */
  paymentRequired?: boolean;
  /** Whether this is rendered in compact / widget mode (omits some copy). */
  compact?: boolean;
  className?: string;
}

const formatSubmittedAt = (iso: string): string => {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

export const PendingReviewCard = ({
  practiceName,
  submittedAt,
  paymentRequired,
  compact = false,
  className,
}: PendingReviewCardProps) => {
  const firmLabel = practiceName?.trim() || 'the practice';
  const dateLabel = submittedAt ? formatSubmittedAt(submittedAt) : null;

  return (
    <div
      role="status"
      aria-label="Intake submitted — pending review"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-white/10',
        'bg-surface-overlay/60 backdrop-blur-md p-4',
        'shadow-glass',
        className,
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
          <Icon icon={CheckCircleIcon} className="h-5 w-5 text-emerald-400" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-input-text leading-snug">
            Request received
          </p>
          {dateLabel && (
            <p className="text-xs text-input-placeholder mt-0.5">
              Submitted {dateLabel}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 pl-11">
        {paymentRequired ? (
          <p className="text-sm text-input-placeholder leading-relaxed">
            Complete your payment to confirm the consultation with {firmLabel}. Once confirmed, they&#8217;ll reach out to schedule your next steps.
          </p>
        ) : (
          <>
            <p className="text-sm text-input-placeholder leading-relaxed">
              {firmLabel} is reviewing your information and will be in touch soon.
            </p>
            {!compact && (
              <div className="flex items-center gap-2 pt-0.5">
                <Icon icon={ClockIcon} className="h-3.5 w-3.5 shrink-0 text-input-placeholder" aria-hidden />
                <p className="text-xs text-input-placeholder">
                  Typical response time is 1–2 business days.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PendingReviewCard;
