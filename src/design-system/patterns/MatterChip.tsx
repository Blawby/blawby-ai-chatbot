import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface MatterChipProps {
  /** Label content — usually "Matter type · Client name". */
  children: ComponentChildren;
  /** Urgent matters render the pin in --neg. */
  urgent?: boolean;
  /** Active = pinned to the focus drawer or currently in view. */
  active?: boolean;
  /** Click handler — chips are interactive by default. */
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  /** Optional title tooltip. */
  title?: string;
  className?: string;
}

/**
 * Matter chip (DESIGN_SYSTEM §3.4).
 *
 * Inline entity reference with a 5px colored pin. Clicking pins the matter
 * to the right focus drawer or navigates to the matter detail page.
 */
export function MatterChip({
  children,
  urgent = false,
  active = false,
  onClick,
  title,
  className
}: MatterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'matter-chip',
        urgent && 'matter-chip-urgent',
        active && 'matter-chip-active',
        className
      )}
      aria-pressed={active}
    >
      <span className="matter-chip-pin" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}
