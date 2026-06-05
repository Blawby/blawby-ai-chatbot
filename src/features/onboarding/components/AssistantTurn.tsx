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
        className="grid h-10 w-10 place-items-center rounded-full text-base font-medium"
        style={{
          background: 'var(--paper)',
          boxShadow: '0 0 0 6px var(--paper)',
        }}
        aria-hidden="true"
      >
        <Logo size="md" showText={false} />
      </div>
      <div
        className="card"
        style={{
          padding: '18px 20px',
          maxWidth: '64ch',
          boxShadow: 'var(--shadow-2)'
        }}
      >
        <div
          className="mb-2.5 flex items-center gap-2"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '10px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--dim)'
          }}
        >
          <span>{label}</span>
          {trail && (
            <span
              className="inline-flex items-center gap-1"
              style={{ color: 'var(--pos)' }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: 'var(--pos)' }}
              />
              {trail}
            </span>
          )}
        </div>
        <div
          style={{
            color: 'var(--ink)',
            fontSize: '15px',
            lineHeight: 1.55
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default AssistantTurn;
