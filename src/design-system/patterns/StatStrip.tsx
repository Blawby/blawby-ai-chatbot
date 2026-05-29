import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface StatStripCell {
  /** Mono uppercase label. */
  label: string;
  /** Serif large value — supports inline VNode for `<small>` units. */
  value: ComponentChildren;
  /** Optional smaller suffix rendered inside the value (e.g. "hrs", "USD"). */
  unit?: string;
  /** Optional mono extra line beneath the value. */
  extra?: string;
  /** Render the extra line in --neg (warn). */
  extraWarn?: boolean;
}

export interface StatStripProps {
  /**
   * The 5 cells. Per spec, StatStrip is canonically 5 cells; passing fewer
   * still renders correctly (CSS grid template fills remaining columns
   * empty), but designs expect 5.
   */
  cells: readonly StatStripCell[];
  className?: string;
}

/**
 * Stat strip (DESIGN_SYSTEM §3.13).
 *
 * 5-cell horizontal strip used in the Matter detail header. Each cell:
 * mono label + serif large number with tabular-nums + optional extra line.
 */
export function StatStrip({ cells, className }: StatStripProps) {
  return (
    <div className={cn('stat-strip', className)}>
      {cells.map((cell, idx) => (
        <div key={`${cell.label}:${idx}`} className="stat-strip-cell">
          <div className="stat-strip-label">{cell.label}</div>
          <div className="stat-strip-value">
            {cell.value}
            {cell.unit && <small>{cell.unit}</small>}
          </div>
          {cell.extra && (
            <div className={cn('stat-strip-extra', cell.extraWarn && 'stat-strip-extra-warn')}>
              {cell.extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
