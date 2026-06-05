import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface BriefingGridProps {
  children: ComponentChildren;
  className?: string;
}

export interface BriefingGridCardProps {
  children: ComponentChildren;
  /** Span both columns (the "morning briefing" hero). */
  spanTwo?: boolean;
  /** Gold-gradient feature variant. Per spec the first/hero card uses this. */
  feature?: boolean;
  className?: string;
}

/**
 * Briefing card grid (DESIGN_SYSTEM §3.14).
 *
 * 2-column grid of cards. **The first card should span both columns** and
 * use the `feature` variant (gold gradient). Subsequent cards are normal.
 *
 * @example
 * <BriefingGrid>
 *   <BriefingGrid.Card spanTwo feature>Morning briefing</BriefingGrid.Card>
 *   <BriefingGrid.Card>Pending invoices</BriefingGrid.Card>
 *   <BriefingGrid.Card>Trust balance</BriefingGrid.Card>
 * </BriefingGrid>
 */
export function BriefingGrid({ children, className }: BriefingGridProps) {
  return <div className={cn('briefing-grid', className)}>{children}</div>;
}

function BriefingGridCard({ children, spanTwo, feature, className }: BriefingGridCardProps) {
  return (
    <article
      className={cn(
        'briefing-grid-card',
        spanTwo && 'briefing-grid-card-span-2',
        feature && 'briefing-grid-card-feature',
        className
      )}
    >
      {children}
    </article>
  );
}

BriefingGrid.Card = BriefingGridCard;
