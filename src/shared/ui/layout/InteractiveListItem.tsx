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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled || !onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.key === ' ') e.preventDefault();
      onClick();
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (disabled || !onClick) return;
    
    // Ignore clicks originating from nested interactive elements
    const interactiveTarget = (e.target as HTMLElement).closest('button, a, [role="button"], input, select, textarea');
    if (interactiveTarget && interactiveTarget !== e.currentTarget) {
      return;
    }

    onClick();
  };

  const content = (
    <div 
      className={cn(
        'flex flex-wrap items-start justify-between gap-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
        padding,
        isSelected ? 'bg-surface-utility/60' : (isClickable && !disabled && 'hover:bg-surface-utility/40 cursor-pointer'),
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable && !disabled ? 0 : -1}
      aria-disabled={disabled}
      aria-pressed={isClickable ? isSelected : undefined}
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
