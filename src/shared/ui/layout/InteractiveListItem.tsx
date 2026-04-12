import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface InteractiveListItemProps {
  children: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  isSelected?: boolean;
  className?: string;
  padding?: string;
}

/**
 * A shared list item with consistent hover states and padding.
 * Deduplicates the "Interactive Row" pattern across feature lists.
 */
export const InteractiveListItem = ({
  children,
  onClick,
  disabled = false,
  isSelected = false,
  className,
  padding = 'px-6 py-4'
}: InteractiveListItemProps) => {
  const isClickable = Boolean(onClick);

  const content = (
    <div className={cn(
      'flex flex-wrap items-start justify-between gap-4 transition-colors',
      padding,
      isSelected ? 'bg-surface-utility/60' : (isClickable && !disabled && 'hover:bg-surface-utility/40 cursor-pointer'),
      disabled && 'opacity-60 cursor-not-allowed',
      className
    )}
    onClick={!disabled ? onClick : undefined}
    >
      {children}
    </div>
  );

  return (
    <li className="list-none">
      {content}
    </li>
  );
};
