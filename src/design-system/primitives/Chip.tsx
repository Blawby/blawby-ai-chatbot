import type { ComponentChildren } from 'preact';
import { X } from 'lucide-preact';
import { cn } from '@/shared/utils/cn';
import { Icon } from '@/shared/ui/Icon';

export type ChipVariant = 'default' | 'primary' | 'accent' | 'warn';

export interface ChipProps {
  variant?: ChipVariant;
  onRemove?: () => void;
  href?: string;
  onClick?: () => void;
  children: ComponentChildren;
  className?: string;
  removeAriaLabel?: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
}

export function Chip({
  variant = 'default',
  onRemove,
  href,
  onClick,
  children,
  className,
  removeAriaLabel = 'Remove',
  title,
  type = 'button',
}: ChipProps) {
  const classes = cn('chip', variant !== 'default' && variant, className);

  const removeButton = onRemove ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      aria-label={removeAriaLabel}
      className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-current/70 hover:text-current"
    >
      <Icon icon={X} className="h-3 w-3" />
    </button>
  ) : null;

  const content = (
    <>
      {children}
      {removeButton}
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes} title={title}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type={type} className={classes} onClick={onClick} title={title}>
        {content}
      </button>
    );
  }

  return (
    <span className={classes} title={title}>
      {content}
    </span>
  );
}
