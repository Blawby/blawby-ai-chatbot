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
  size?: 'xs' | 'sm' | 'md' | 'lg';
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
  const body = (
    <div className={cn('flex items-center gap-3 min-w-0 w-full', className)}>
      <Avatar src={image} name={name} size={size} status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-input-text truncate leading-snug" title={name}>
            {name}
          </p>
          {badge && (
            <span className="shrink-0 inline-flex items-center rounded-full glass-input px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-input-placeholder">
              {badge}
            </span>
          )}
        </div>
        {secondary && (
          <p className="text-xs text-input-placeholder truncate leading-snug mt-0.5" title={secondary}>
            {secondary}
          </p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `Select ${name}`}
        className="w-full text-left rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        {body}
      </button>
    );
  }

  return <div className="px-3 py-2">{body}</div>;
};
