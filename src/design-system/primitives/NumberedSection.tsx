import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type NumberedSectionState = 'done' | 'now' | 'next';

export interface NumberedSectionProps {
  /** 1-indexed step number. Rendered inside the indicator when state === 'next'. */
  number: number;
  /** Current step state — drives indicator color/shape and title styling. */
  state: NumberedSectionState;
  /** Serif H3 title. */
  title: string;
  /** Optional mono dim subtitle. */
  description?: string;
  /** Section body — indented below the title. */
  children?: ComponentChildren;
  className?: string;
}

/**
 * Numbered + state-aware section heading
 * (Engagement.html .section / Onboarding.html .step).
 *
 * Used for step progression: form sections in the engagement editor, and
 * the left-rail step list in onboarding. The indicator changes shape by
 * state — checkmark for done, ring for now, numbered chip for next.
 */
export function NumberedSection({
  number,
  state,
  title,
  description,
  children,
  className,
}: NumberedSectionProps) {
  return (
    <section
      className={cn('numbered-section', `numbered-section-${state}`, className)}
      data-state={state}
    >
      <h3 className="numbered-section-title">
        <span className="numbered-section-indicator" aria-hidden="true">
          {state === 'done' ? '✓' : number}
        </span>
        <span>{title}</span>
      </h3>
      {description && <p className="numbered-section-desc">{description}</p>}
      {children && <div className="numbered-section-body">{children}</div>}
    </section>
  );
}
