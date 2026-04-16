/**
 * UserCard - Molecule Component
 *
 * Combines Avatar with user identity details (name, role/email) and an
 * optional trailing action slot (e.g. a remove button or role badge).
 * Designed for team lists, assignee pickers, and inspector panels.
 */

import { Avatar } from '../atoms/Avatar';
import { cn } from '@/shared/utils/cn';
import type { ComponentChildren } from 'preact';

export type SelectableUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

interface UserCardProps {
  name: string;
  image?: string | null;
  /** Secondary line — usually email or role label */
  secondary?: string | null;
  /** Optional badge text rendered as a pill (e.g. "Owner", "Admin") */
  badge?: string | null;
  /** Avatar size — defaults to 'md' */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Optional status dot on the avatar bubble */
  status?: 'active' | 'inactive';
  /** Trailing slot — action buttons, chevrons, etc. */
  trailing?: ComponentChildren;
  className?: string;
  /** If provided, wraps the card body in a <button> */
  onClick?: () => void;
  /** aria-label for the clickable wrapper */
  ariaLabel?: string;
}

export const UserCard = ({
  name,
  image,
  secondary,
  badge,
  size = 'md',
  status,
  trailing,
  className = '',
  onClick,
  ariaLabel
}: UserCardProps) => {
  const clickableBody = (
    <div className="flex items-center gap-3 min-w-0 w-full">
      <Avatar src={image} name={name} size={size} status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-[rgb(var(--input-foreground))] truncate leading-snug" title={name}>
            {name}
          </p>
          {badge && (
            <span className="shrink-0 inline-flex items-center rounded-full glass-input px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--input-placeholder))]">
              {badge}
            </span>
          )}
        </div>
        {secondary && (
          <p className="text-xs text-[rgb(var(--input-placeholder))] truncate leading-snug mt-0.5" title={secondary}>
            {secondary}
          </p>
        )}
      </div>
    </div>
  );

  const cardContent = (
    <div className="flex items-center gap-3 min-w-0">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel ?? `Select ${name}`}
          className={cn(
            'flex-1 text-left rounded-xl px-3 py-2 transition-colors hover:bg-[rgb(var(--surface-utility)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500))]',
            className
          )}
        >
          {clickableBody}
        </button>
      ) : (
        <div className={cn('flex-1 rounded-xl px-3 py-2', className)}>{clickableBody}</div>
      )}
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );

  return cardContent;
};
