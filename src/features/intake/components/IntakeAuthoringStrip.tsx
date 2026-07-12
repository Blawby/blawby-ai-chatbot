import { Check, RefreshCw, Sparkles, X } from 'lucide-preact';

import type { IntakeTemplateSuggestion } from '@/features/intake/api/intakeTemplatesApi';
import { Pill } from '@/design-system/primitives';
import { Button } from '@/shared/ui/Button';

type SuggestionLoadState = 'idle' | 'loading' | 'ready' | 'error';

interface IntakeAuthoringStripProps {
  revision?: number;
  suggestions: IntakeTemplateSuggestion[];
  loadState: SuggestionLoadState;
  actingSuggestionId: string | null;
  canLoad: boolean;
  onRefresh: () => void;
  onApply: (suggestion: IntakeTemplateSuggestion) => void;
  onDismiss: (suggestion: IntakeTemplateSuggestion) => void;
}

const operationLabel = (operation: IntakeTemplateSuggestion['proposed_edits'][number]['operation']): string => {
  if (operation === 'condition_change') return 'condition';
  return operation;
};

const describeEdits = (suggestion: IntakeTemplateSuggestion): string => {
  const operations = [...new Set(suggestion.proposed_edits.map((edit) => operationLabel(edit.operation)))];
  const noun = suggestion.proposed_edits.length === 1 ? 'edit' : 'edits';
  return `${suggestion.proposed_edits.length} proposed ${noun}: ${operations.join(', ')}`;
};

export function IntakeAuthoringStrip({
  revision,
  suggestions,
  loadState,
  actingSuggestionId,
  canLoad,
  onRefresh,
  onApply,
  onDismiss,
}: IntakeAuthoringStripProps) {
  const stagedSuggestions = suggestions.filter((suggestion) => suggestion.status === 'staged');

  return (
    <section className="mb-6 rounded-md border border-line-subtle bg-paper-2 px-4 py-3" aria-labelledby="assistant-suggestions-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="assistant-suggestions-title" className="text-sm font-medium text-ink">Assistant suggestions</h3>
              <Pill tone="dim">{typeof revision === 'number' ? `Revision ${revision}` : 'Unsaved template'}</Pill>
              {stagedSuggestions.length > 0 ? (
                <Pill tone="warn">{stagedSuggestions.length} staged</Pill>
              ) : null}
            </div>
            <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-dim-2">
              {canLoad
                ? 'Suggestions staged through the assistant appear here for review. Nothing changes until you apply one.'
                : 'Save this template before reviewing assistant suggestions.'}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          onClick={onRefresh}
          disabled={!canLoad || loadState === 'loading' || actingSuggestionId !== null}
        >
          {loadState === 'loading' ? 'Checking' : 'Refresh'}
        </Button>
      </div>

      {loadState === 'error' ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line-subtle bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-xs text-warn">Suggestions could not be loaded. Retry after the backend contract is available.</p>
          <Button variant="outline" size="xs" onClick={onRefresh}>Retry</Button>
        </div>
      ) : null}

      {loadState === 'ready' && stagedSuggestions.length === 0 ? (
        <p className="mt-3 border-t border-line-subtle pt-3 text-xs text-dim-2">No staged suggestions for this revision.</p>
      ) : null}

      {stagedSuggestions.length > 0 ? (
        <ul className="mt-3 divide-y divide-line-subtle border-t border-line-subtle" aria-label="Staged template suggestions">
          {stagedSuggestions.map((suggestion) => {
            const isActing = actingSuggestionId === suggestion.id;
            return (
              <li key={suggestion.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{suggestion.instruction}</p>
                  <p className="mt-0.5 text-xs text-dim-2">{describeEdits(suggestion)}</p>
                  <p className="mt-1 text-[11px] text-dim-2">
                    {suggestion.analytics_evidence.status === 'available'
                      ? `Evidence: ${suggestion.analytics_evidence.numerator ?? 0} of ${suggestion.analytics_evidence.denominator ?? 0}`
                      : suggestion.analytics_evidence.reason ?? `Evidence unavailable from ${suggestion.analytics_evidence.provenance}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="accent-ghost"
                    size="xs"
                    icon={Check}
                    onClick={() => onApply(suggestion)}
                    disabled={actingSuggestionId !== null}
                  >
                    {isActing ? 'Applying' : 'Apply'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={X}
                    onClick={() => onDismiss(suggestion)}
                    disabled={actingSuggestionId !== null}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export type { SuggestionLoadState };
