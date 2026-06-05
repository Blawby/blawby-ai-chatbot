import { FunctionComponent } from 'preact';

import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

export interface ClientEngagementDecideRowProps {
  /** Counterparty name shown in the primary CTA, e.g. "Accept & engage Sarah". */
  attorneyName?: string | null;
  /** Practice / firm name used as a fallback when no attorney name is provided. */
  practiceName: string;
  /** Sub-copy describing what happens on accept. Caller composes from engagement data. */
  description?: string;
  /** Disable the buttons (e.g. while accept request in flight or already accepted). */
  disabled?: boolean;
  /** True when the primary button is OK to press (acks + signature satisfied). */
  canSign: boolean;
  /** Show "Signing…" on the primary while a request is in flight. */
  isAccepting?: boolean;
  /** Accept handler — calls the existing acceptEngagement pipeline. */
  onAccept: () => void;
  /** Decline handler. */
  onDecline?: () => void;
  className?: string;
}

/**
 * Decide row — replaces the stacked Sign + Decline stack with the canonical
 * "Ready to accept?" card from EngagementReview.html.
 *
 * Heading + side-by-side description + Decline (secondary) | Accept (primary)
 * button pair. Collapses to a single column on mobile.
 */
export const ClientEngagementDecideRow: FunctionComponent<ClientEngagementDecideRowProps> = ({
  attorneyName,
  practiceName,
  description,
  disabled,
  canSign,
  isAccepting,
  onAccept,
  onDecline,
  className,
}) => {
  const acceptLabel = attorneyName?.trim()
    ? `Accept & engage ${attorneyName.trim()}`
    : `Accept & engage ${practiceName}`;

  const subCopy = description
    ?? 'On accept, your matter is opened, a welcome email is sent, and any required retainer deposit is requested. You will receive a portal link by email within a minute.';

  return (
    <section
      className={cn(
        'mx-auto grid max-w-[900px] grid-cols-1 items-center gap-6 rounded-[var(--r-md)] border border-rule bg-card px-4 py-6 shadow-[var(--shadow-2)] sm:grid-cols-[1fr_auto] sm:gap-6 sm:px-8',
        className,
      )}
    >
      <div>
        <h3 className="m-0 mb-1 font-serif text-[24px] font-normal leading-[1.15] tracking-[-0.012em] text-ink">
          Ready to{' '}
          <em className="text-accent" style={{ fontStyle: 'italic' }}>accept?</em>
        </h3>
        <p className="m-0 text-[13.5px] leading-[1.55] text-ink-2">{subCopy}</p>
      </div>
      <div className="flex items-center gap-2 max-sm:justify-end">
        {onDecline && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onDecline}
            disabled={disabled || isAccepting}
          >
            Decline politely
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={onAccept}
          disabled={!canSign}
        >
          {isAccepting ? 'Signing…' : `${acceptLabel} ↗`}
        </Button>
      </div>
    </section>
  );
};

export default ClientEngagementDecideRow;
