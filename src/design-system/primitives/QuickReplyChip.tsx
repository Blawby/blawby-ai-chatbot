import { cn } from '@/shared/utils/cn';

export interface QuickReplyChipProps {
  label: string;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Rounded-pill chip rendered inline inside AI message bubbles for quick reply
 * options. Ghost (card) when idle, accent-filled (ink-on-accent) when
 * `selected` — sticky until the next message arrives. See Intake.html `.qchip`.
 */
export function QuickReplyChip({
  label,
  selected = false,
  onClick,
  disabled = false,
  className,
}: QuickReplyChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center justify-center rounded-full border px-[14px] py-[9px]',
        'font-sans text-sm leading-none transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-accent-ink'
          : 'border-[color:var(--rule)] bg-[color:var(--card)] text-ink-2 hover:border-[color:var(--ink)] hover:bg-[color:var(--paper)]',
        className,
      )}
    >
      {label}
    </button>
  );
}
