import type { ComponentChildren } from 'preact';

import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Pill } from '@/design-system/primitives';

export interface IntakeFirmBarProps {
  /** Firm display name (rendered in serif). */
  practiceName: string;
  /** Optional firm logo. Initials fallback when absent. */
  practiceLogo?: string | null;
  /** Pre-formatted secondary line — e.g. "Family law · Charlotte, NC · NC Bar #45382".
   *  Callers compose from whatever practice metadata is available. */
  subtitle?: string | null;
  /** Optional back button, rendered to the left of the avatar. */
  leadingAction?: ComponentChildren;
  /** Optional right-side actions (close button, etc.). */
  actions?: ComponentChildren;
  /** Trust message rendered as a green-dot pill on the right.
   *  Defaults to "Confidential · encrypted end-to-end" (Intake.html). */
  trustLabel?: string;
  className?: string;
}

/**
 * Public-intake chat header. Per Intake.html `.intake-head`: paper-tinted bar
 * with a 32px firm avatar, serif practice name, monospace metadata sub-line,
 * and a green-dot "Confidential · encrypted" pill on the right. Bespoke
 * component (not DetailHeader) because the typography stack (serif title,
 * monospace subtitle, accent-gold trust pill) diverges meaningfully from the
 * generic DetailHeader, and intake chat headers don't need the
 * back/inspector/secondary-row wiring DetailHeader provides.
 */
export function IntakeFirmBar({
  practiceName,
  practiceLogo,
  subtitle,
  leadingAction,
  actions,
  trustLabel = 'Confidential · encrypted end-to-end',
  className,
}: IntakeFirmBarProps) {
  // `intake-firm-bar` marker class is consumed by mobile-only rules in
  // src/index.css §3.23 (sticky top + safe-area-inset-top padding so the bar
  // pins beneath the iOS notch while the convo scrolls beneath).
  const cls = [
    'intake-firm-bar flex items-center gap-3 border-b border-rule px-4 py-3.5',
    'bg-[color:color-mix(in_oklab,var(--paper)_96%,var(--card))]',
    className,
  ].filter(Boolean).join(' ');

  return (
    <header className={cls}>
      {leadingAction}
      <Avatar
        src={practiceLogo ?? null}
        name={practiceName}
        size="sm"
        className="!h-8 !w-8 !text-base"
      />
      <div className="min-w-0 flex-1 leading-tight">
        {/* whitespace-nowrap prevents the practice name from wrapping onto a
            second line on mobile when the trust pill or actions get close —
            the `truncate` already in place handles the overflow with an
            ellipsis (Mobile.html §intake firm-bar `.name` shows a single
            line at any width). */}
        <div className="truncate whitespace-nowrap font-serif text-[15px] leading-[1.2] tracking-[-0.005em] text-ink">
          {practiceName || 'Practice'}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
            {subtitle}
          </div>
        ) : null}
      </div>
      {/* Trust signal — text pill at >=sm, single green dot below sm so the
          header row stays compact on narrow widths (Mobile.html §intake
          firm-bar `.lock` shows just a lock glyph; we use a green-pos dot to
          match the encrypted/confidential tone the pill uses on desktop). */}
      <span
        aria-label={trustLabel}
        title={trustLabel}
        className="intake-firm-bar-dot h-2 w-2 shrink-0 rounded-full bg-[color:var(--pos)] sm:hidden"
      />
      <Pill tone="live" className="hidden shrink-0 sm:inline-flex">
        {trustLabel}
      </Pill>
      {actions ? <div className="ml-1 flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}
