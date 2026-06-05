import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface ObservationProps {
  /** Mono uppercase label — defaults to "I noticed". */
  label?: string;
  /** The serif italic text — the AI being a peer, not a chatbot. */
  children: ComponentChildren;
  /** Optional chip row below the text. */
  actions?: ComponentChildren;
  className?: string;
}

/**
 * AI observation / "I noticed" (DESIGN_SYSTEM §3.6).
 *
 * Left-border accent strip the AI uses to volunteer something unprompted.
 */
export function Observation({ label = 'I noticed', children, actions, className }: ObservationProps) {
  return (
    <section className={cn('observation', className)}>
      <div className="observation-label">{label}</div>
      <div className="observation-text">{children}</div>
      {actions && <div className="observation-actions">{actions}</div>}
    </section>
  );
}
