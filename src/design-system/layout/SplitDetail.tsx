import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface SplitDetailProps {
  /** Left column — typically a scrollable list of items (~380px). */
  list: ComponentChildren;
  /** Right column — the active item's detail surface. */
  detail: ComponentChildren;
  className?: string;
  /** Aria label for the split region. */
  ariaLabel?: string;
}

/**
 * SplitDetail — DS two-column list/detail layout.
 *
 * Left column is a fixed ~380px scrollable list. Right column is a flex
 * detail surface. Active list items should add the `.active` class to get
 * the 3px gold left accent border (handled by `.split-detail-list-item`
 * in src/index.css when consumers render list items with that class).
 */
export function SplitDetail({ list, detail, className, ariaLabel }: SplitDetailProps) {
  return (
    <div
      className={cn('split-detail', className)}
      role="region"
      aria-label={ariaLabel}
    >
      <div className="split-detail-list">{list}</div>
      <div className="split-detail-pane">{detail}</div>
    </div>
  );
}
