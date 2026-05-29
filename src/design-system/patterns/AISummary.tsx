import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface AISummaryProps {
  /** Mono uppercase label shown at top — e.g. "Assistant summary". */
  label?: string;
  /** Optional "grounded in N sources" verifier shown next to the label. */
  verifier?: string;
  /** Lede paragraph(s) — use ComponentChildren so consumers can embed <em>. */
  children: ComponentChildren;
  /** Optional chip row beneath the body. */
  actions?: ComponentChildren;
  className?: string;
}

/**
 * AI summary card (DESIGN_SYSTEM §3.1).
 *
 * The gold-tinted hero AI block. Every AI assertion must be followed by a
 * citation (Citations) OR a "grounded in N sources" verifier label — never
 * assert without source.
 */
export function AISummary({ label, verifier, children, actions, className }: AISummaryProps) {
  return (
    <section className={cn('ai-summary', className)}>
      {(label || verifier) && (
        <div className="ai-summary-label">
          {label && <span>{label}</span>}
          {verifier && <span className="ai-summary-verify">{verifier}</span>}
        </div>
      )}
      <p className="ai-summary-body">{children}</p>
      {actions && <div className="ai-summary-actions">{actions}</div>}
    </section>
  );
}
