import { Pill } from '@/design-system/primitives/Pill';
import { cn } from '@/shared/utils/cn';

export interface CitationSource {
  /** Table or source name — e.g. "matters". */
  table: string;
  /** Row count or document count returned. */
  count: number;
  /** When true, renders as the primary "live" pill (green dot). */
  isLive?: boolean;
  /** Optional title tooltip on hover. */
  title?: string;
}

export interface CitationsProps {
  sources: readonly CitationSource[];
  className?: string;
}

/**
 * Citation pill row (DESIGN_SYSTEM §3.3).
 *
 * Shown beneath every AI response. Pill text is `<table_name> · <row_count>`.
 * The first pill (or any with `isLive`) is the primary source — green dot.
 * This is what makes the AI auditable.
 */
export function Citations({ sources, className }: CitationsProps) {
  if (sources.length === 0) return null;
  return (
    <div className={cn('citations', className)} role="list" aria-label="Sources">
      {sources.map((source) => (
        <span role="listitem" key={`${source.table}:${source.count}`}>
          <Pill
            tone={source.isLive ? 'live' : 'dim'}
            dot={source.isLive}
            title={source.title}
          >
            {source.table} · {source.count}
          </Pill>
        </span>
      ))}
    </div>
  );
}
