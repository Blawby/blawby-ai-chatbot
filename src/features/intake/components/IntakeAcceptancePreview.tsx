import { FunctionComponent } from 'preact';

import { NumberedSection } from '@/design-system/primitives';
import { cn } from '@/shared/utils/cn';

export interface IntakeAcceptancePreviewProps {
  /** Practice area string used to personalize the engagement template line. */
  practiceArea: string | null;
  /** Willing retainer (cents) — used in trust-deposit step copy. */
  retainerCents: number | null;
  /** Currency for retainer formatting. */
  currency?: string;
  /** Number of days a task gets to be reviewed (default 3). */
  taskDueInDays?: number;
  className?: string;
}

function formatRetainer(cents: number | null, currency = 'USD'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/**
 * "What happens if you accept" 5-step preview — purely informational, never
 * triggers the underlying accept flow. The Accept buttons on the sticky
 * header and AI verdict card drive the real handlers.
 *
 * All steps render as 'next' (the parent flow is not yet running).
 */
export const IntakeAcceptancePreview: FunctionComponent<IntakeAcceptancePreviewProps> = ({
  practiceArea,
  retainerCents,
  currency = 'USD',
  taskDueInDays = 3,
  className,
}) => {
  const areaText = practiceArea ? practiceArea : 'this practice area';
  const retainerLabel = formatRetainer(retainerCents, currency);

  const steps: ReadonlyArray<{ title: string; description: string }> = [
    {
      title: 'Matter created',
      description: 'Auto-created from intake metadata',
    },
    {
      title: 'Engagement drafted',
      description: `Pre-filled from your ${areaText} template`,
    },
    {
      title: 'Trust deposit requested',
      description: retainerCents != null
        ? `${retainerLabel} held in IOLTA (refundable until consult ends)`
        : 'Retainer held in IOLTA once amount is set',
    },
    {
      title: 'First message sent',
      description: 'Welcome note + request for any missing documents',
    },
    {
      title: 'First task created',
      description: `Review submitted info (${taskDueInDays}-day deadline)`,
    },
  ];

  return (
    <section
      className={cn(
        'rounded-r-md border border-card-border bg-card overflow-hidden',
        className,
      )}
      aria-label="Acceptance preview — 5 steps"
    >
      <div className="flex items-center justify-between border-b border-line-subtle bg-paper-2 px-4 py-3 sm:px-5">
        <h3 className="font-serif text-base font-normal tracking-tight text-ink">
          What happens if you accept
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          5 steps · preview only
        </span>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        {steps.map((step, idx) => (
          <NumberedSection
            key={`step-${idx + 1}`}
            number={idx + 1}
            state="next"
            title={step.title}
            description={step.description}
          />
        ))}
      </div>
    </section>
  );
};

export default IntakeAcceptancePreview;
