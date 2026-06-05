import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';

import { AIAnswerCard, type AIAnswerCardAction, type AIAnswerCardSource } from '@/design-system/patterns';
import type { IntakeEnrichedData } from '@/shared/types/intake';

/**
 * Maps numeric case strength to a 0–5 rating.
 *
 * Backend exposes case_strength as either:
 *  - a percentage (0–100), or
 *  - a 0–5 rating
 *
 * Both shapes appear in the codebase (IntakeListItem · PracticeIntakeDetail);
 * normalize to a 0–5 scale for display.
 */
function normalizeCaseStrength(raw: number | null | undefined): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw <= 0) return 0;
  if (raw <= 5) return Math.round(raw * 10) / 10;
  // Treat anything > 5 as a 0-100 percentage.
  return Math.round((raw / 20) * 10) / 10;
}

/** Recommended action verdict — derived from case strength + conflict + urgency. */
type Verdict = 'accept' | 'counter' | 'follow_up' | 'decline';

function deriveVerdict(
  caseStrength: number | null,
  conflictCount: number,
  urgency: string | null | undefined,
): Verdict {
  if (conflictCount > 0) return 'follow_up';
  if (caseStrength == null) return 'follow_up';
  if (caseStrength >= 4) return urgency === 'emergency' ? 'accept' : 'counter';
  if (caseStrength >= 3) return 'counter';
  if (caseStrength >= 2) return 'follow_up';
  return 'decline';
}

function formatCents(cents: number | null | undefined, currency = 'USD'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

export interface IntakeAIVerdictProps {
  /** Enriched-data row produced at intake submission. */
  enrichedData: IntakeEnrichedData | null;
  /** Raw case_strength (0-100 or 0-5). */
  caseStrength: number | null;
  /** Urgency tier from the intake. */
  urgency: string | null | undefined;
  /** Practice area derived for the recommendation lede. */
  practiceArea: string | null;
  /** Current consult / fee in cents (from intake.amount). */
  currentOfferCents: number | null;
  /** Suggested counter offer in cents (TODO(backend): real value). */
  counterOfferCents: number | null;
  /** Currency code (default USD). */
  currency?: string;
  /** Source citations — table → count rows. */
  sources: readonly AIAnswerCardSource[];
  /** Grounding time stamp text (e.g. "12 minutes ago"). */
  groundingTime: string;
  /** Handlers — wired to existing accept/decline/schedule flows on the page. */
  onAcceptWithCounter?: () => void;
  onAcceptAtCurrent?: () => void;
  onAskFollowUp?: () => void;
  onDecline?: () => void;
  /** Disable buttons while a parent request is pending. */
  isBusy?: boolean;
}

/**
 * Gold-tinted AI Verdict card — the chat-first centerpiece of the intake
 * detail surface. Produces a deterministic recommendation from intake data
 * and exposes 4 action chips that reuse the existing accept/decline handlers.
 *
 * TODO(backend): replace the deterministic lede / verdict mapping with a real
 * per-action recommendation endpoint (practice-assistant.recommendIntake).
 */
export const IntakeAIVerdict: FunctionComponent<IntakeAIVerdictProps> = ({
  enrichedData,
  caseStrength,
  urgency,
  practiceArea,
  currentOfferCents,
  counterOfferCents,
  currency = 'USD',
  sources,
  groundingTime,
  onAcceptWithCounter,
  onAcceptAtCurrent,
  onAskFollowUp,
  onDecline,
  isBusy = false,
}) => {
  const normalizedStrength = normalizeCaseStrength(caseStrength);
  const conflictCount = enrichedData?.conflict_check_names?.length ?? 0;
  const verdict = deriveVerdict(normalizedStrength, conflictCount, urgency);

  const counterLabel = formatCents(counterOfferCents, currency);
  const currentLabel = formatCents(currentOfferCents, currency);

  const groundingLabel = useMemo(() => {
    const total = sources.reduce((sum, s) => sum + s.count, 0);
    const sourceCount = total > 0 ? `${total} source${total === 1 ? '' : 's'}` : 'live context';
    return `My recommendation · grounded in ${sourceCount} · ${groundingTime}`;
  }, [sources, groundingTime]);

  const verdictText = useMemo(() => {
    const strengthLabel = normalizedStrength != null ? `${normalizedStrength.toFixed(1)}/5` : 'unknown';
    const urgencyLabel = urgency === 'emergency'
      ? 'an emergency'
      : urgency === 'time_sensitive'
        ? 'time-sensitive'
        : 'routine';
    const areaLabel = practiceArea ? `fits ${practiceArea}` : 'matches your typical scope';

    if (verdict === 'accept') {
      return (
        <>
          Accept this one. Case strength {strengthLabel}, {urgencyLabel} in a way you can act on,
          and {areaLabel}. No conflicts surfaced.
        </>
      );
    }
    if (verdict === 'counter') {
      return (
        <>
          Strong fit — case strength {strengthLabel}, {areaLabel}. Recommend accepting and
          countering at {counterLabel} in the engagement.
        </>
      );
    }
    if (verdict === 'follow_up') {
      const reasons: string[] = [];
      if (conflictCount > 0) {
        reasons.push(`${conflictCount} potential conflict${conflictCount === 1 ? '' : 's'} to clear`);
      }
      if (normalizedStrength != null && normalizedStrength < 3) {
        reasons.push('case strength is borderline');
      }
      const reasonText = reasons.length > 0 ? ` — ${reasons.join(' and ')}` : '';
      return (
        <>
          Ask a follow-up first{reasonText}. Case strength {strengthLabel}, urgency {urgencyLabel}.
        </>
      );
    }
    return (
      <>
        Likely a decline. Case strength is low ({strengthLabel}), and the scope is outside your
        typical range. Consider referring out.
      </>
    );
  }, [verdict, normalizedStrength, urgency, practiceArea, counterLabel, conflictCount]);

  const actions: AIAnswerCardAction[] = [];
  if (onAcceptWithCounter) {
    actions.push({
      id: 'accept-counter',
      label: `Accept & counter ${counterLabel}`,
      variant: verdict === 'counter' ? 'primary' : 'secondary',
      onClick: () => {
        if (!isBusy) onAcceptWithCounter();
      },
    });
  }
  if (onAcceptAtCurrent && currentOfferCents != null) {
    actions.push({
      id: 'accept-current',
      label: `Accept at ${currentLabel}`,
      variant: verdict === 'accept' ? 'primary' : 'secondary',
      onClick: () => {
        if (!isBusy) onAcceptAtCurrent();
      },
    });
  }
  if (onAskFollowUp) {
    actions.push({
      id: 'follow-up',
      label: 'Ask follow-up',
      variant: verdict === 'follow_up' ? 'primary' : 'secondary',
      onClick: () => {
        if (!isBusy) onAskFollowUp();
      },
    });
  }
  if (onDecline) {
    actions.push({
      id: 'decline',
      label: 'Decline with reason',
      variant: verdict === 'decline' ? 'primary' : 'secondary',
      onClick: () => {
        if (!isBusy) onDecline();
      },
    });
  }

  return (
    <AIAnswerCard
      groundingLabel={groundingLabel}
      lede={verdictText}
      actions={actions}
      sources={sources}
    />
  );
};

export default IntakeAIVerdict;
