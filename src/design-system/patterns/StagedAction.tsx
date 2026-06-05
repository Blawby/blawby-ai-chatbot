import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface StagedActionProps {
  /** Mono uppercase label — defaults to "Staged · awaits your approval". */
  label?: string;
  /** Serif title naming the action — e.g. "Invoice draft · $1,245.00". */
  title: string;
  /** Optional description explaining what the action is based on. */
  description?: ComponentChildren;
  /**
   * Action chips. The IOLTA gate REQUIRES an explicit human click —
   * callers MUST disable the primary button while a request is pending
   * and never auto-execute. Backend enforces idempotency (409), audit,
   * and role gating on `practice_assistant_actions`.
   */
  actions?: ComponentChildren;
  className?: string;
}

/**
 * Staged-action card (DESIGN_SYSTEM §3.2).
 *
 * Holds AI-proposed writes awaiting approval. Used in matter detail,
 * invoice detail, trust ledger. **Never let a staged action auto-execute.**
 */
export function StagedAction({
  label = 'Staged · awaits your approval',
  title,
  description,
  actions,
  className
}: StagedActionProps) {
  return (
    <section className={cn('staged-action', className)} aria-label={`Staged action: ${title}`}>
      <div className="staged-action-label">{label}</div>
      <div className="staged-action-title">{title}</div>
      {description && <div className="staged-action-desc">{description}</div>}
      {actions && <div className="staged-action-actions">{actions}</div>}
    </section>
  );
}
