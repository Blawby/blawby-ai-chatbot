import type { ComponentChildren } from 'preact';
import { Logo } from '@/shared/ui/Logo';

interface AssistantTurnProps {
  /** Optional mono label — defaults to "Practice assistant". */
  label?: string;
  /** Optional dim suffix shown next to the label (e.g. "private to you"). */
  trail?: string;
  /** Main bubble body. */
  children: ComponentChildren;
}

/**
 * Inline assistant turn for the onboarding stage (Onboarding.html `.ai-row`).
 *
 * Local-only helper (not exported as a DS primitive) — it composes a small
 * accent-tinted avatar with a card-tinted bubble that grounds each step in
 * the user's prior answers. Patterned after `AIAnswerCard`/`Observation` but
 * trimmed to onboarding's needs (no citations, no actions).
 */
export const AssistantTurn = ({
  label = 'Practice assistant',
  trail,
  children
}: AssistantTurnProps) => {
  return (
    <div className="grid grid-cols-[40px_1fr] items-start gap-4">
      <div
        className="grid h-10 w-10 place-items-center rounded-full bg-paper text-base font-medium shadow-[0_0_0_6px_var(--paper)]"
        aria-hidden="true"
      >
        <Logo size="md" showText={false} />
      </div>
      <div className="card max-w-[64ch] px-5 py-[18px] shadow-[var(--shadow-2)]">
        <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          <span>{label}</span>
          {trail && (
            <span className="inline-flex items-center gap-1 text-pos">
              <span className="h-[5px] w-[5px] rounded-full bg-pos" />
              {trail}
            </span>
          )}
        </div>
        <div className="text-[15px] leading-[1.55] text-ink">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AssistantTurn;
