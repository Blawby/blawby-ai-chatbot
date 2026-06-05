import { useCallback } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/shared/utils/cn';

export type AIRibbonVariant = 'authoring' | 'observation' | 'regeneration';

export interface AIRibbonAction {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface AIRibbonProps {
  /**
   * Visual variant:
   * - `authoring` (default) — thin gold gradient band, full-width hero-like accent
   * - `observation` — left-border accent strip (the "I noticed" shape)
   * - `regeneration` — subtle pulsing tint (the assistant is regenerating)
   */
  variant?: AIRibbonVariant;
  /**
   * Custom avatar — defaults to an italic-serif "B" badge in accent.
   * Pass `null` to hide.
   */
  avatar?: ComponentChildren;
  /** Title text — e.g. "Tell me what to add, remove, or rephrase". */
  title?: string;
  /** Optional explanation rendered beside or below the title. */
  body?: ComponentChildren;
  /** When true, renders a contenteditable pill inline beside the title. */
  editable?: boolean;
  /** Fired when the editable input value changes. */
  onEdit?: (text: string) => void;
  /** 1–3 action chips on the right. */
  actions?: readonly AIRibbonAction[];
  className?: string;
}

/**
 * AIRibbon (DESIGN_SYSTEM §3.6 + Engagement/Reports ribbon variants).
 *
 * Gradient accent ribbon for authoring / observation / regeneration moments.
 * Used on Engagement workbench, EngagementTemplates, IntakeBuilder, Reports.
 *
 * Three visual flavors with shared anatomy (avatar + title + body + actions),
 * differentiated by tint and edge treatment:
 * - `authoring` renders a thin gold gradient band — used when the assistant
 *   has produced a draft and is offering refinement actions.
 * - `observation` renders the left-border accent strip — used when the
 *   assistant volunteers an insight unprompted.
 * - `regeneration` renders a subtle pulsing tint — used while the assistant
 *   is regenerating content.
 */
export function AIRibbon({
  variant = 'authoring',
  avatar,
  title,
  body,
  editable = false,
  onEdit,
  actions,
  className
}: AIRibbonProps) {
  const avatarNode =
    avatar === undefined ? <span className="ai-ribbon-avatar">B</span> : avatar;

  const handleEdit = useCallback<JSX.GenericEventHandler<HTMLDivElement>>(
    (event) => {
      onEdit?.((event.currentTarget as HTMLDivElement).innerText);
    },
    [onEdit]
  );

  return (
    <div
      className={cn('ai-ribbon', `ai-ribbon-${variant}`, className)}
      role="region"
      aria-label={title || 'Assistant'}
    >
      {avatarNode && <div className="ai-ribbon-avatar-slot">{avatarNode}</div>}
      <div className="ai-ribbon-content">
        {(title || editable || body) && (
          <div className="ai-ribbon-text">
            {title && <span className="ai-ribbon-title">{title}</span>}
            {editable && (
              <div
                className="ai-ribbon-edit"
                contentEditable
                role="textbox"
                aria-label="Edit instruction"
                onInput={handleEdit}
              />
            )}
            {body && <div className="ai-ribbon-body">{body}</div>}
          </div>
        )}
      </div>
      {actions && actions.length > 0 && (
        <div className="ai-ribbon-actions">
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
    </div>
  );
}
