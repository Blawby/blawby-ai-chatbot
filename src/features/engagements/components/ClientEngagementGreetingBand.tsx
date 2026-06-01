import { FunctionComponent } from 'preact';

import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { cn } from '@/shared/utils/cn';

export interface ClientEngagementGreetingBandProps {
  /** Client first name, used in the H1. */
  clientFirstName: string;
  /** Practice / firm display name — used in fallback avatar initials and intro copy. */
  practiceName: string;
  /** Optional practice logo URL. */
  practiceLogo?: string | null;
  /** Optional attorney first name used in the H1 — falls back to practiceName. */
  attorneyFirstName?: string | null;
  /** Optional kicker line above H1 (mono dim). */
  kicker?: string;
  /** Pre-written intro paragraph; when omitted, a sensible default is composed. */
  intro?: string;
  className?: string;
}

/**
 * Greeting band — large avatar + serif H1 with accent italic phrase + warm intro paragraph.
 * Mirrors `.greet` section in `design_handoff_blawby_chat_first/screens/EngagementReview.html`.
 *
 * The H1 reads: "Hi {firstName} — *here's the agreement* {attorney} wants to sign with you."
 * Avatar shrinks 48 → 36px on mobile via Tailwind responsive utilities; H1 shrinks 42 → 28px.
 */
export const ClientEngagementGreetingBand: FunctionComponent<ClientEngagementGreetingBandProps> = ({
  clientFirstName,
  practiceName,
  practiceLogo,
  attorneyFirstName,
  kicker,
  intro,
  className,
}) => {
  const displayName = clientFirstName?.trim() || 'there';
  const attorney = attorneyFirstName?.trim() || practiceName;

  // Default warm intro — caller can override with engagement-specific copy.
  const introCopy = intro
    ?? `It is a short read. We have highlighted what is in scope, what it costs, and what we both agree to. Review the acknowledgments below and sign at the bottom — if anything looks off, use "Ask a question" to loop ${attorney} in directly.`;

  return (
    <section
      className={cn(
        'mx-auto flex max-w-[900px] items-start gap-4 border-b border-rule px-4 py-5 sm:gap-[18px] sm:px-8 sm:py-[22px] max-sm:flex-col',
        className,
      )}
    >
      <Avatar
        src={practiceLogo ?? null}
        name={practiceName}
        size="lg"
        className="!h-9 !w-9 !text-base sm:!h-12 sm:!w-12 sm:!text-lg shrink-0"
      />
      <div className="min-w-0 flex-1">
        {kicker ? (
          <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-dim">
            {kicker}
          </div>
        ) : null}
        <h1 className="m-0 font-serif text-[28px] font-normal leading-[1.05] tracking-[-0.018em] text-ink text-balance sm:text-[42px]">
          Hi {displayName} — <em className="text-accent" style={{ fontStyle: 'italic' }}>here&apos;s the agreement</em> {attorney} wants to sign with you.
        </h1>
        <p className="m-0 mt-2.5 max-w-[62ch] text-[15px] leading-[1.55] text-ink-2">
          {introCopy}
        </p>
      </div>
    </section>
  );
};

export default ClientEngagementGreetingBand;
