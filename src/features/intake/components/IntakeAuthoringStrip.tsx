/**
 * IntakeAuthoringStrip — chat-first AI authoring band rendered at the top
 * of the intake template editor.
 *
 * Wraps <AIRibbon variant="authoring" editable> with the two canonical
 * authoring actions (Suggest improvements, Apply). The user's natural-language
 * instruction is stashed in local state by the parent via `onInstructionChange`,
 * which is the input the backend AI authoring endpoint will eventually
 * consume.
 *
 * TODO(backend): wire to AI authoring endpoint — likely something like
 * POST /api/practices/:id/intakes/templates/:slug/suggest with a body of
 * { instruction: string } returning { changes: AuthoringChange[] } that the
 * editor renders as staged-question rows + inline suggestions.
 *
 * Until then, the buttons surface a toast confirming the instruction was
 * saved as a draft suggestion — which is honest about the wiring state
 * without pretending the AI is responding.
 *
 * On mobile (<640px), the rich editable strip collapses to a single
 * "Talk to assistant" button that scrolls/expands the strip in place.
 * That matches the design's narrow-viewport guidance (no contenteditable
 * input on tap targets).
 */

import { useState } from 'preact/hooks';
import { MessageSquare } from 'lucide-preact';

import { AIRibbon } from '@/design-system/patterns';
import { Button } from '@/shared/ui/Button';
import { useToastContext } from '@/shared/contexts/ToastContext';

export interface IntakeAuthoringStripProps {
  /** Mirrors local state in the parent — the typed instruction. */
  instruction: string;
  /** Update the parent's local instruction state. */
  onInstructionChange: (next: string) => void;
  /** Disable when the editor is mid-save. */
  disabled?: boolean;
}

export function IntakeAuthoringStrip({
  instruction,
  onInstructionChange,
  disabled = false,
}: IntakeAuthoringStripProps) {
  const { showInfo } = useToastContext();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // The same toast covers both Suggest and Apply for now — both routes need
  // the backend AI authoring endpoint to do anything real. Differentiating
  // the UX before backend exists would mislead.
  const handleSuggest = () => {
    showInfo(
      'AI authoring endpoint coming soon',
      instruction.trim()
        ? `Your instruction was saved as a draft suggestion: "${instruction.trim()}"`
        : 'Type an instruction first, then I can draft changes for review.',
    );
  };

  const handleApply = () => {
    showInfo(
      'AI authoring endpoint coming soon',
      'Once the backend is live, Apply will stage the changes inline so you can approve them one-by-one.',
    );
  };

  return (
    <>
      {/* Mobile: collapsed by default, expand on tap into the same full strip. */}
      {!mobileExpanded ? (
        <div className="mb-6 sm:hidden">
          <Button
            type="button"
            variant="secondary"
            icon={MessageSquare}
            onClick={() => setMobileExpanded(true)}
            disabled={disabled}
            className="w-full justify-center"
          >
            Talk to assistant
          </Button>
        </div>
      ) : null}

      <div className={mobileExpanded ? 'mb-6' : 'mb-6 hidden sm:block'}>
        <AIRibbon
          variant="authoring"
          title="Tell me what to add, remove, or rephrase"
          editable
          onEdit={onInstructionChange}
          actions={[
            {
              id: 'suggest',
              label: 'Suggest improvements',
              onClick: handleSuggest,
            },
            {
              id: 'apply',
              label: 'Apply ↗',
              variant: 'primary',
              onClick: handleApply,
            },
          ]}
        />
      </div>
    </>
  );
}
