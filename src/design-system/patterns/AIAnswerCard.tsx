import type { ComponentChildren } from 'preact';
import { Citations } from './Citations';
import { cn } from '@/shared/utils/cn';

export interface AIAnswerCardAction {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface AIAnswerCardSource {
  table: string;
  count: number;
}

export interface AIAnswerCardProps {
  /**
   * Custom avatar — defaults to a small italic-serif "B" badge in accent.
   * Pass `null` to hide.
   */
  avatar?: ComponentChildren;
  /**
   * Mono uppercase grounding label shown at top — e.g.
   * "Practice assistant · grounded in 12 sources · 7:02 am".
   */
  groundingLabel: string;
  /** Large serif paragraph — the primary insight. */
  lede: ComponentChildren;
  /** Optional smaller body text below the lede. */
  body?: ComponentChildren;
  /** Action chips below the body. */
  actions?: readonly AIAnswerCardAction[];
  /** Citation pills rendered as `<table> · <count>` beneath actions. */
  sources?: readonly AIAnswerCardSource[];
  className?: string;
}

/**
 * AIAnswerCard (DESIGN_SYSTEM §3.1, chat-first answer variant).
 *
 * Gold-tinted card rendering the AI's grounded reply to a one-off ask on a
 * list view. Used on Home / Matters / Clients / Reports. Composes the same
 * gradient shape as `AISummary` but adds an avatar slot, a separate body
 * paragraph, action chips, and an inline `Citations` row — the full reply
 * surface for an ask, not just the lede.
 *
 * Per spec, every AI assertion needs a citation OR a grounding label —
 * `groundingLabel` is required for that reason.
 */
export function AIAnswerCard({
  avatar,
  groundingLabel,
  lede,
  body,
  actions,
  sources,
  className
}: AIAnswerCardProps) {
  const avatarNode =
    avatar === undefined ? <span className="ai-answer-card-avatar">B</span> : avatar;

  return (
    <section className={cn('ai-answer-card', className)} aria-label="Assistant answer">
      {avatarNode && <div className="ai-answer-card-avatar-slot">{avatarNode}</div>}
      <div className="ai-answer-card-body">
        <div className="ai-answer-card-grounding">{groundingLabel}</div>
        <p className="ai-answer-card-lede">{lede}</p>
        {body && <div className="ai-answer-card-text">{body}</div>}
        {actions && actions.length > 0 && (
          <div className="ai-answer-card-actions">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={cn('chip', action.variant === 'primary' && 'primary')}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        {sources && sources.length > 0 && (
          <Citations
            sources={sources.map((source, idx) => ({
              table: source.table,
              count: source.count,
              isLive: idx === 0
            }))}
          />
        )}
      </div>
    </section>
  );
}
