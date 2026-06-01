import { FunctionComponent } from 'preact';
import { Sparkles } from 'lucide-preact';

import { StatStrip, type StatStripCell } from '@/design-system/patterns';
import { SignalPill, type SignalPillSignal } from '@/design-system/primitives';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import type { IntakeEnrichedData } from '@/shared/types/intake';

/** Normalize raw case_strength (0-100 or 0-5) to a 0-5 numeric value. */
function normalizeCaseStrength(raw: number | null | undefined): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw <= 0) return 0;
  if (raw <= 5) return Math.round(raw * 10) / 10;
  return Math.round((raw / 20) * 10) / 10;
}

function caseStrengthSignal(value: number | null): SignalPillSignal | null {
  if (value == null) return null;
  if (value < 2) return 'urgent';
  if (value < 3) return 'warn';
  if (value >= 4) return 'healthy';
  return 'quiet';
}

function urgencySignal(urgency: string | null | undefined): SignalPillSignal | null {
  if (urgency === 'emergency') return 'urgent';
  if (urgency === 'time_sensitive') return 'warn';
  if (urgency === 'routine') return 'healthy';
  return null;
}

function formatUrgencyLabel(urgency: string | null | undefined): string {
  if (urgency === 'emergency') return 'Emergency';
  if (urgency === 'time_sensitive') return 'Time-sensitive';
  if (urgency === 'routine') return 'Routine';
  return '—';
}

function formatPracticeArea(value: string | null): string {
  if (!value) return '—';
  return value
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatRetainerCents(cents: number | null | undefined, currency = 'USD'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

export interface IntakeScorecardProps {
  /** Enriched-data row from AI submission. */
  enrichedData: IntakeEnrichedData | null;
  /** Raw case_strength from intake (0-100 or 0-5). */
  caseStrength: number | null;
  /** Urgency tier. */
  urgency: string | null | undefined;
  /** Stamp text under the strip ("computed at submission · 2.4s"). */
  computedStamp: string;
  className?: string;
}

/**
 * 4-cell AI scorecard grid (replaces the previous flat "AI Analysis" card).
 *
 * Cells: case strength · urgency · practice area · willing retainer.
 *
 * TODO(backend): expose `willing_retainer` on IntakeEnrichedData so the 4th
 * cell becomes meaningful. Today it renders "—" because that field is not
 * extracted by the AI enrichment pipeline.
 */
export const IntakeScorecard: FunctionComponent<IntakeScorecardProps> = ({
  enrichedData,
  caseStrength,
  urgency,
  computedStamp,
  className,
}) => {
  const normalizedStrength = normalizeCaseStrength(caseStrength);
  const strengthSignal = caseStrengthSignal(normalizedStrength);
  const uSignal = urgencySignal(urgency);

  // The IntakeEnrichedData type does not currently expose `willing_retainer`,
  // so the 4th cell is a TODO placeholder. Read defensively in case backend
  // adds it via metadata expansion.
  const willingRetainer = (enrichedData as unknown as Record<string, unknown> | null)?.willing_retainer;
  const retainerLabel = typeof willingRetainer === 'number'
    ? formatRetainerCents(willingRetainer)
    : '—';

  const cells: StatStripCell[] = [
    {
      label: 'Case strength',
      value: (
        <span className="inline-flex items-baseline gap-1.5">
          {normalizedStrength != null ? normalizedStrength.toFixed(1) : '—'}
          {normalizedStrength != null ? (
            <span className="font-mono text-xs text-dim-2">/5</span>
          ) : null}
        </span>
      ),
      extra: strengthSignal
        ? strengthSignal === 'urgent'
          ? 'low · review carefully'
          : strengthSignal === 'warn'
            ? 'borderline'
            : strengthSignal === 'healthy'
              ? 'strong fit'
              : 'fair'
        : undefined,
      extraWarn: strengthSignal === 'urgent',
    },
    {
      label: 'Urgency',
      value: formatUrgencyLabel(urgency),
      extra: uSignal === 'urgent'
        ? 'act today'
        : uSignal === 'warn'
          ? 'this week'
          : uSignal === 'healthy'
            ? 'no rush'
            : undefined,
      extraWarn: uSignal === 'urgent',
    },
    {
      label: 'Practice area',
      value: (
        <span className="font-sans text-base font-medium tracking-normal">
          {formatPracticeArea(enrichedData?.practice_area ?? null)}
        </span>
      ),
      extra: enrichedData?.sub_type ? enrichedData.sub_type.replace(/_/g, ' ') : undefined,
    },
    {
      label: 'Willing retainer',
      value: retainerLabel,
      extra: retainerLabel === '—' ? 'awaiting client signal' : undefined,
    },
  ];

  return (
    <section
      className={cn(
        'rounded-r-md border border-card-border bg-card',
        'overflow-hidden',
        className,
      )}
      aria-label="AI enrichment scorecard"
    >
      <div className="flex items-center justify-between border-b border-line-subtle bg-paper-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Icon icon={Sparkles} className="h-4 w-4 text-accent-deep" />
          <h3 className="font-serif text-base font-normal tracking-tight text-ink sm:text-lg">
            AI enrichment
          </h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          {computedStamp}
        </span>
      </div>

      <StatStrip cells={cells} className="!grid-cols-2 sm:!grid-cols-4 !rounded-none !border-0" />

      {/* Inline signal pill row — surfaces semantic signals beneath the strip. */}
      {(strengthSignal || uSignal) ? (
        <div className="flex flex-wrap gap-2 border-t border-line-subtle px-4 py-3 sm:px-6">
          {strengthSignal ? (
            <SignalPill
              signal={strengthSignal}
              label={
                strengthSignal === 'urgent' ? 'low strength'
                  : strengthSignal === 'warn' ? 'borderline'
                    : strengthSignal === 'healthy' ? 'strong'
                      : 'fair strength'
              }
            />
          ) : null}
          {uSignal ? (
            <SignalPill
              signal={uSignal}
              label={formatUrgencyLabel(urgency)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default IntakeScorecard;
