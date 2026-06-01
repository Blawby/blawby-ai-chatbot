/**
 * IntakeStagedQuestionRow — "the assistant proposed this question; approve,
 * edit, or dismiss" row variant.
 *
 * Visually distinct from a saved question (dashed border + mono dim
 * "staged by assistant" label + Approve / Edit / Dismiss chips) so the
 * practice owner can tell at a glance which questions are part of their
 * live form and which are pending review.
 *
 * TODO(backend): staged questions are currently driven by a local-state
 * seed in the editor so the chat-first authoring loop has something to
 * approve. Once the AI authoring endpoint exists, the editor will hydrate
 * `stagedQuestions` from the suggestion response and use the existing
 * `addBlankField` handler to materialize approved entries.
 */

import { Chip } from '@/design-system/primitives';
import { cn } from '@/shared/utils/cn';

export interface StagedQuestion {
  id: string;
  /** Human label — the question text that would render to the client. */
  label: string;
  /** Brief assistant rationale — why this question is being proposed. */
  rationale: string;
  /** Optional preview prompt that mirrors `previewQuestion` on real fields. */
  previewQuestion?: string;
}

export interface IntakeStagedQuestionRowProps {
  staged: StagedQuestion;
  onApprove: (staged: StagedQuestion) => void;
  onEdit?: (staged: StagedQuestion) => void;
  onDismiss: (staged: StagedQuestion) => void;
  disabled?: boolean;
  className?: string;
}

export function IntakeStagedQuestionRow({
  staged,
  onApprove,
  onEdit,
  onDismiss,
  disabled = false,
  className,
}: IntakeStagedQuestionRowProps) {
  return (
    <div
      role="listitem"
      aria-label={`Staged question: ${staged.label}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-dashed border-accent/45 bg-accent/[0.04] px-3 py-2.5',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim-2">
            staged by assistant
          </p>
          <p className="mt-1 truncate text-sm text-ink">{staged.label}</p>
          {staged.rationale ? (
            <p className="mt-1 line-clamp-2 text-xs text-dim-2">{staged.rationale}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip variant="primary" onClick={() => onApprove(staged)}>
          Approve
        </Chip>
        {onEdit ? <Chip onClick={() => onEdit(staged)}>Edit</Chip> : null}
        <Chip variant="warn" onClick={() => onDismiss(staged)}>
          Dismiss
        </Chip>
      </div>
    </div>
  );
}
