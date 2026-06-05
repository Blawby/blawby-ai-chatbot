/**
 * IntakeSuggestionBanner — inline AI suggestion rendered above a question
 * row when the assistant has something to volunteer.
 *
 * Wraps the `<Observation>` pattern with the canonical three-action toolbar
 * (Apply / Why? / Dismiss). The "I'd suggest" framing matches the design's
 * peer voice — the assistant volunteers something unprompted instead of
 * waiting to be asked.
 *
 * TODO(backend): suggestions are currently driven by a local-state seed in
 * the editor (one example per fresh template load) so the UX renders.
 * Once the AI authoring endpoint exists, the editor will fetch real
 * suggestions and pass them through here. The shape (`type`, `message`,
 * `rationale`) is already a stable union so the swap is mechanical.
 */

import type { ComponentChildren } from 'preact';

import { Observation } from '@/design-system/patterns';
import { Chip } from '@/design-system/primitives';

export type IntakeSuggestionType = 'reorder' | 'rephrase' | 'add' | 'remove';

export interface IntakeAiSuggestion {
  id: string;
  type: IntakeSuggestionType;
  /** Short headline — "Move the consult-fee after jurisdiction". */
  message: string;
  /** Longer rationale used when the user taps "Why?" — kept terse on purpose. */
  rationale: string;
}

export interface IntakeSuggestionBannerProps {
  suggestion: IntakeAiSuggestion;
  onApply: (suggestion: IntakeAiSuggestion) => void;
  onDismiss: (suggestion: IntakeAiSuggestion) => void;
  /** Toggle to expand the rationale in place. Owned by the parent. */
  expanded?: boolean;
  onToggleExpanded?: (suggestion: IntakeAiSuggestion) => void;
  className?: string;
}

export function IntakeSuggestionBanner({
  suggestion,
  onApply,
  onDismiss,
  expanded = false,
  onToggleExpanded,
  className,
}: IntakeSuggestionBannerProps) {
  const actions: ComponentChildren = (
    <>
      <Chip variant="primary" onClick={() => onApply(suggestion)}>
        Apply
      </Chip>
      {onToggleExpanded ? (
        <Chip onClick={() => onToggleExpanded(suggestion)}>
          {expanded ? 'Hide rationale' : 'Why?'}
        </Chip>
      ) : null}
      <Chip variant="warn" onClick={() => onDismiss(suggestion)}>
        Dismiss
      </Chip>
    </>
  );

  return (
    <Observation label="I'd suggest" actions={actions} className={className}>
      <>
        {suggestion.message}
        {expanded ? (
          <span className="mt-2 block font-sans text-[13px] not-italic leading-relaxed text-ink-2">
            {suggestion.rationale}
          </span>
        ) : null}
      </>
    </Observation>
  );
}
