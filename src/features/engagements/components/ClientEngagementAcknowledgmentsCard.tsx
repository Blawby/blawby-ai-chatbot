import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';

import { cn } from '@/shared/utils/cn';

export type AcknowledgmentKey = 'read' | 'scope' | 'guarantee';

export interface AcknowledgmentChecks {
  read: boolean;
  scope: boolean;
  guarantee: boolean;
}

export interface AcknowledgmentRow {
  key: AcknowledgmentKey;
  heading: string;
  body: ComponentChildren;
}

export interface ClientEngagementAcknowledgmentsCardProps {
  /** Current check state. */
  checks: AcknowledgmentChecks;
  /** Toggle handler — receives the changed key and its new boolean state. */
  onToggle: (key: AcknowledgmentKey, checked: boolean) => void;
  /** Disable interactions (e.g. while accepting). */
  disabled?: boolean;
  /** Override the three rows; defaults to canonical copy from EngagementReview.html. */
  rows?: readonly AcknowledgmentRow[];
  className?: string;
}

const DEFAULT_ROWS: readonly AcknowledgmentRow[] = [
  {
    key: 'read',
    heading: 'I have had time to read this letter.',
    body: 'I understand I can take this to another lawyer for a second opinion before signing. I have not been pressured to sign quickly.',
  },
  {
    key: 'scope',
    heading: 'I understand the scope and the fee.',
    body: 'The work described above is what the firm will do. The fee structure and any retainer or filing-cost estimates are what I will pay.',
  },
  {
    key: 'guarantee',
    heading: 'I understand no outcome is guaranteed.',
    body: 'The firm will represent me competently, but cannot guarantee a particular result. No outcome was promised in order to obtain my signature.',
  },
];

/**
 * Three-row acknowledgments card — replaces the single "I have read and agree"
 * checkbox with the canonical 3-check pattern from EngagementReview.html.
 *
 * All three checks must be true for the parent's accept button to enable.
 * Built as a local feature component rather than a primitive because the
 * heading + sub-paragraph layout is engagement-specific.
 */
export const ClientEngagementAcknowledgmentsCard: FunctionComponent<ClientEngagementAcknowledgmentsCardProps> = ({
  checks,
  onToggle,
  disabled,
  rows = DEFAULT_ROWS,
  className,
}) => {
  return (
    <section
      className={cn('card px-8 py-7', className)}
      aria-labelledby="ack-card-heading"
    >
      <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-dim">
        Three quick acknowledgments
      </div>
      <h3
        id="ack-card-heading"
        className="mb-1.5 mt-0.5 font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.012em] text-ink"
      >
        Before you{' '}
        <em className="text-accent" style={{ fontStyle: 'italic' }}>sign,</em>
        {' '}please confirm.
      </h3>
      <p className="mb-5 max-w-[60ch] text-[14px] leading-[1.55] text-ink-2">
        These are required to make this agreement enforceable. Check each one as you read it.
      </p>

      <div role="group" aria-labelledby="ack-card-heading">
        {rows.map((row, idx) => {
          const checked = checks[row.key];
          const inputId = `ack-${row.key}`;
          return (
            <label
              key={row.key}
              htmlFor={inputId}
              className={cn(
                'grid cursor-pointer grid-cols-[22px_1fr] items-start gap-3.5 py-4',
                idx > 0 && 'border-t border-rule',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="checkbox"
                id={inputId}
                checked={checked}
                disabled={disabled}
                onChange={(e) => onToggle(row.key, (e.target as HTMLInputElement).checked)}
                className="sr-only"
                aria-describedby={`${inputId}-body`}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-[4px] border-[1.5px] transition-all',
                  checked
                    ? 'border-ink bg-ink'
                    : 'border-ink-3 bg-card',
                )}
              >
                {checked && (
                  <span className="text-[12px] leading-none text-accent">✓</span>
                )}
              </span>
              <span className="block">
                <span className="mb-1 block text-[15px] font-medium leading-[1.45] text-ink">
                  {row.heading}
                </span>
                <span
                  id={`${inputId}-body`}
                  className="block text-[13px] leading-[1.55] text-ink-2"
                >
                  {row.body}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
};

export default ClientEngagementAcknowledgmentsCard;
