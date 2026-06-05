import { useMemo } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { AlertTriangle } from 'lucide-preact';

import { Pill } from '@/design-system/primitives';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

import { useTrustAuditTrail, type TrustAuditEvent } from '../hooks/useTrustAuditTrail';

interface TrustAuditTrailPaneProps {
  practiceId: string | null;
  /** Lookback window in days. Defaults to 7. */
  days?: number;
  /** Max events to fetch. Defaults to 25. */
  limit?: number;
}

/**
 * Map an event to the rough actor label shown in the row. We display
 * the actor type rather than fabricating a name when the actor isn't
 * resolved server-side — DESIGN_SYSTEM rule: never invent grounding.
 */
const actorLabel = (event: TrustAuditEvent): string => {
  if (event.actorType === 'lawyer') return 'Lawyer';
  if (event.actorType === 'user') return 'User';
  if (event.actorType === 'system') return 'System';
  return 'System';
};

/**
 * Friendly headline for an event. The worker stores `event_type` in
 * snake_case (e.g. `payment_completed`); convert to a human phrase
 * without leaning on the server-side `title` since that field is empty
 * for conversation events.
 */
const headlineForEvent = (event: TrustAuditEvent): string => {
  if (event.title && event.title.trim().length > 0 && event.title !== event.eventType) {
    return event.title;
  }
  return event.eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
};

/**
 * Day bucket label — "Today", "Yesterday", or "Tue Dec 03".
 */
const formatDayHeader = (iso: string, now: Date = new Date()): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const today = startOfDay(now);
  const that = startOfDay(d);
  const diffDays = Math.round((today.getTime() - that.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
  });
};

const dayKey = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Group by local Y-M-D so timezone-adjacent rows land on the right day.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface DayBucket {
  key: string;
  header: string;
  events: TrustAuditEvent[];
}

/**
 * Audit trail card (Trust.html .right-col .audit-row).
 *
 * Grouped by date with day headers ("Today", "Yesterday", "Tue Dec 03").
 * Renders org-wide trust-relevant events from the worker's
 * `/api/activity` endpoint, filtered to the trust event-type allowlist.
 */
export const TrustAuditTrailPane: FunctionComponent<TrustAuditTrailPaneProps> = ({
  practiceId,
  days = 7,
  limit = 25,
}) => {
  const { events, loading, error, refetch } = useTrustAuditTrail(practiceId ?? '', {
    days,
    limit,
    enabled: Boolean(practiceId),
  });

  const buckets = useMemo<DayBucket[]>(() => {
    if (events.length === 0) return [];
    const grouped = new Map<string, DayBucket>();
    for (const ev of events) {
      const key = dayKey(ev.eventDate);
      const existing = grouped.get(key);
      if (existing) {
        existing.events.push(ev);
      } else {
        grouped.set(key, {
          key,
          header: formatDayHeader(ev.eventDate),
          events: [ev],
        });
      }
    }
    // Newest day first; events within a day are already DESC from worker.
    return Array.from(grouped.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [events]);

  const headerCount = events.length;

  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-rule bg-paper-2 px-5 py-3">
        <div className="flex flex-col">
          <h3 className="font-serif text-lg leading-tight text-ink">Audit trail</h3>
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            org-wide · last {days} days
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          {headerCount} {headerCount === 1 ? 'event' : 'events'}
        </span>
      </header>

      {error ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-neg">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim underline hover:text-ink"
            onClick={refetch}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!error && loading && events.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-dim">
          <LoadingSpinner size="sm" ariaLabel="Loading audit trail" announce={false} />
          <span>Fetching audit events</span>
        </div>
      ) : null}

      {!error && !loading && events.length === 0 ? (
        <div className="px-5 py-6 text-sm text-dim">
          No trust-related events in the last {days} days. Deposits, transfers, and refunds
          appear here as soon as they&apos;re recorded.
        </div>
      ) : null}

      {buckets.map((bucket) => (
        <div key={bucket.key}>
          <div className="flex items-center justify-between border-b border-rule bg-paper-2/60 px-5 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim-2">
              {bucket.header}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim-2">
              {bucket.events.length}
            </span>
          </div>
          {bucket.events.map((event) => (
            <article
              key={event.uid ?? event.id}
              className="flex items-start gap-3 border-b border-rule px-5 py-3 last:border-b-0"
            >
              <span
                className="w-[68px] shrink-0 pt-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim"
                title={event.eventDate}
              >
                {formatRelativeTime(event.eventDate)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Pill tone="dim">{actorLabel(event)}</Pill>
                  <span className="font-serif text-sm leading-snug text-ink">
                    {headlineForEvent(event)}
                  </span>
                </div>
                {event.description ? (
                  <p className="text-sm leading-snug text-ink-2">{event.description}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ))}
    </section>
  );
};

export default TrustAuditTrailPane;
