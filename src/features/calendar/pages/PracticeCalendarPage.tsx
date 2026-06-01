import { useCallback, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { ChevronLeft, ChevronRight } from 'lucide-preact';

import { Page } from '@/shared/ui/layout/Page';
import { Button } from '@/shared/ui/Button';
import {
  AIAskBar,
  AIAnswerCard,
  Seg,
  StatStrip,
  type SegOption
} from '@/design-system/patterns';

import { useCalendarEvents } from '@/features/calendar/services/useCalendarEvents';
import { CalendarMonthView } from '@/features/calendar/components/CalendarMonthView';
import { CalendarWeekView } from '@/features/calendar/components/CalendarWeekView';
import { CalendarAgendaView } from '@/features/calendar/components/CalendarAgendaView';
import {
  CalendarFilterChips,
  type CalendarFilterKind
} from '@/features/calendar/components/CalendarFilterChips';
import { CalendarFocusDrawer } from '@/features/calendar/components/CalendarFocusDrawer';
import type { CalendarEvent } from '@/features/calendar/types';

type ViewMode = 'month' | 'week' | 'agenda';

const VIEW_OPTIONS: ReadonlyArray<SegOption<ViewMode>> = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'agenda', label: 'Agenda' }
];

const ASK_SUGGESTIONS = [
  'Court dates this week',
  'Overdue tasks',
  'Upcoming engagement expiries'
] as const;

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const parseEventDate = (value: string): Date | null => {
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const monthLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const weekLabel = (date: Date): string => {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', fmt)} — ${end.toLocaleDateString('en-US', fmt)}`;
};

const now = () => Date.now();

interface PracticeCalendarPageProps {
  /** Practice id resolved from the route (`/practice/:slug/calendar`). */
  practiceId?: string | null;
  /** Slug used for matter deep-links — falls back to the URL on undefined. */
  practiceSlug?: string | null;
}

/**
 * Calendar deadlines aggregation screen — `/practice/:slug/calendar`.
 *
 * Aggregates across six source surfaces (no dedicated calendar backend exists):
 *   1. Task     — matter task `due_date`
 *   2. Time     — matter time entry `start_time`
 *   3. Engagement — contract `sent_at` / `accepted_at` / `sent_at + 30d` expiry
 *   4. Invoice  — invoice `dueDate`
 *   5. Court    — matter `court_date` (defensive pass-through; only present
 *                 if backend exposes it on the matter wire row)
 *   6. Milestone — matter milestone `due_date`
 *
 * The page is chat-first: an AI ask bar at the top fronts a deterministic
 * answer card stub (real AI grounding via PracticeAssistantQueryEngine is a
 * TODO(backend)), filter chips apply to all three views, and selecting any
 * event opens a right focus drawer with the prep checklist + matter context.
 */
export function PracticeCalendarPage({
  practiceId,
  practiceSlug
}: PracticeCalendarPageProps) {
  const location = useLocation();
  const navigate = useCallback((path: string) => location.route(path), [location]);
  const slug = (practiceSlug ?? '').trim();

  const [view, setView] = useState<ViewMode>('agenda');
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [filters, setFilters] = useState<Set<CalendarFilterKind>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [askedQuery, setAskedQuery] = useState<string | null>(null);

  const { events, isLoading, error, truncated, refresh } = useCalendarEvents(practiceId ?? null);

  // ── Filtered set — empty filter set === "all kinds". ─────────────────────
  const filteredEvents = useMemo(() => {
    if (filters.size === 0) return events;
    return events.filter((event) => filters.has(event.kind as CalendarFilterKind));
  }, [events, filters]);

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return filteredEvents.filter((event) => {
      const parsed = parseEventDate(event.date);
      return parsed ? parsed.getTime() >= today : false;
    });
  }, [filteredEvents]);

  // ── Header stat counts: this week / court / calls (this last is zeroed). ──
  const headerCounts = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const sevenDays = today + 7 * 24 * 60 * 60 * 1000;
    let thisWeek = 0;
    let court = 0;
    for (const event of events) {
      const parsed = parseEventDate(event.date);
      if (!parsed) continue;
      const time = parsed.getTime();
      if (time >= today && time <= sevenDays) thisWeek += 1;
      if (event.kind === 'court') court += 1;
    }
    return { thisWeek, court };
  }, [events]);

  // ── Filter toggles ──────────────────────────────────────────────────────
  const toggleFilter = useCallback((kind: CalendarFilterKind) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(new Set()), []);

  // ── Navigation ──────────────────────────────────────────────────────────
  const handlePrev = useCallback(() => {
    setAnchor((current) => {
      const next = new Date(current);
      if (view === 'month') next.setMonth(current.getMonth() - 1);
      else if (view === 'week') next.setDate(current.getDate() - 7);
      else next.setDate(current.getDate() - 1);
      return next;
    });
  }, [view]);

  const handleNext = useCallback(() => {
    setAnchor((current) => {
      const next = new Date(current);
      if (view === 'month') next.setMonth(current.getMonth() + 1);
      else if (view === 'week') next.setDate(current.getDate() + 7);
      else next.setDate(current.getDate() + 1);
      return next;
    });
  }, [view]);

  const handleToday = useCallback(() => setAnchor(startOfDay(new Date())), []);

  const handleMatterClick = useCallback((matterId: string) => {
    if (!slug) return;
    navigate(`/practice/${encodeURIComponent(slug)}/matters/${encodeURIComponent(matterId)}`);
  }, [navigate, slug]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleDrawerClose = useCallback(() => setSelectedEvent(null), []);

  // ── AI ask bar — stubbed query → deterministic answer card. ─────────────
  // TODO(backend): wire onSubmit to PracticeAssistantQueryEngine for a real
  // grounded calendar query endpoint. Today we surface a deterministic answer
  // that uses the aggregated event corpus so the surface isn't an empty shell.
  // Timestamp captured at submit-time so the answer card grounding label
  // stays stable instead of ticking on every render.
  const [askedAt, setAskedAt] = useState<string | null>(null);
  const handleAskSubmit = useCallback((query: string) => {
    setAskedQuery(query);
    setAskedAt(
      new Date(now()).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    );
  }, []);

  const answerSourceCount = events.length;

  // ── Navigation label ─────────────────────────────────────────────────────
  const navLabel =
    view === 'month' ? monthLabel(anchor)
      : view === 'week' ? weekLabel(anchor)
        : anchor.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Page padded={false} className="flex h-full flex-col">
      <div className="flex h-full">
        {/* Main column ----------------------------------------------------- */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

          {/* Chat-first page header: serif H1 with em accent on "deadlines"
              + right-aligned StatStrip with three deterministic cells. */}
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
            <div className="min-w-0">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
                Calendar
              </div>
              <h1 className="mt-1.5 font-serif text-[32px] font-normal leading-none tracking-tight text-ink lg:text-[44px]">
                Calendar &amp; <em className="not-italic text-accent-deep">deadlines.</em>
              </h1>
            </div>
            <StatStrip
              cells={[
                {
                  label: 'This week',
                  value: <span className="tabular-nums">{headerCounts.thisWeek}</span>
                },
                {
                  label: 'Court',
                  value: <span className="tabular-nums">{headerCounts.court}</span>
                },
                {
                  // No backend meetings/calls table — surfaces as 0 with TODO.
                  label: 'Calls',
                  value: <span className="tabular-nums">0</span>,
                  extra: 'no meetings table'
                }
                // TODO(backend): meetings/calls aggregation endpoint.
              ]}
              className="ml-auto max-w-[420px]"
            />
          </header>

          {/* AI ask bar — non-sticky, chat-first composer. ------------------ */}
          <AIAskBar
            placeholder="What's coming up? · 'court dates this week' · 'overdue tasks'"
            suggestions={ASK_SUGGESTIONS}
            sticky={false}
            onSubmit={handleAskSubmit}
            disclaimer="Blawby never writes without your approval"
          />

          {/* AI answer card — appears only after a query has been asked. --- */}
          {askedQuery && (
            <AIAnswerCard
              groundingLabel={`Practice assistant · grounded in ${answerSourceCount} ${answerSourceCount === 1 ? 'event' : 'events'}${askedAt ? ` · ${askedAt}` : ''}`}
              lede={
                <>
                  Here&apos;s what I see for <em className="not-italic text-accent-deep">&quot;{askedQuery}&quot;</em>.
                  {/* TODO(backend): replace deterministic lede with real AI narrative
                      from PracticeAssistantQueryEngine. */}
                </>
              }
              body={
                <p className="m-0">
                  I aggregated across tasks, time, engagements, invoices, court
                  dates and milestones. Filter the list below to drill in, or
                  open any row to see prep status.
                </p>
              }
              actions={[
                { id: 'show-list', label: 'Show as list', onClick: () => setView('agenda') },
                { id: 'open-court', label: 'Filter to court', onClick: () => setFilters(new Set(['court'])) },
                { id: 'dismiss', label: 'Dismiss', onClick: () => setAskedQuery(null) }
              ]}
              sources={[
                { table: 'matter_tasks', count: events.filter((e) => e.kind === 'task').length },
                { table: 'milestones', count: events.filter((e) => e.kind === 'milestone').length },
                { table: 'engagements', count: events.filter((e) => e.kind === 'engagement').length },
                { table: 'invoices', count: events.filter((e) => e.kind === 'invoice').length },
                { table: 'court_dates', count: events.filter((e) => e.kind === 'court').length }
              ]}
            />
          )}

          {/* Error + truncation banners --------------------------------- */}
          {error && (
            <div className="status-error rounded-md px-4 py-3 text-sm">
              {error}
            </div>
          )}
          {truncated && (
            <div className="status-warning rounded-md px-4 py-3 text-sm">
              This practice has more matters than the calendar fan-out can fetch in
              one pass. Events from matters beyond the cap are not shown.
            </div>
          )}

          {/* Filter chips above the view toggle ------------------------- */}
          <CalendarFilterChips
            events={events}
            active={filters}
            onToggle={toggleFilter}
            onClear={clearFilters}
          />

          {/* View toggle + date nav + refresh -------------------------- */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Seg<ViewMode>
              value={view}
              options={VIEW_OPTIONS}
              onChange={setView}
              ariaLabel="Calendar view mode"
            />

            <div className="flex items-center gap-2">
              {view !== 'agenda' && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous"
                    className="flex h-8 w-8 items-center justify-center rounded-r-xs border border-rule bg-card text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="rounded-r-xs border border-rule bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink transition-colors hover:border-ink-3"
                  >
                    Today
                  </button>
                  <span className="px-2 font-mono text-xs uppercase tracking-[0.06em] text-ink">
                    {navLabel}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next"
                    className="flex h-8 w-8 items-center justify-center rounded-r-xs border border-rule bg-card text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={refresh} disabled={isLoading}>
                {isLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* Body — month / week / agenda ------------------------------ */}
          {view === 'month' && (
            <CalendarMonthView
              anchor={anchor}
              events={filteredEvents}
              onEventClick={handleEventClick}
              selectedEventId={selectedEvent?.id ?? null}
            />
          )}

          {view === 'week' && (
            <CalendarWeekView
              anchor={anchor}
              events={filteredEvents}
              onEventClick={handleEventClick}
              selectedEventId={selectedEvent?.id ?? null}
            />
          )}

          {view === 'agenda' && (
            <CalendarAgendaView
              events={upcomingEvents}
              isLoading={isLoading}
              error={error}
              onMatterClick={handleMatterClick}
              onSelect={handleEventClick}
              selectedEventId={selectedEvent?.id ?? null}
            />
          )}
        </div>

        {/* Right focus drawer ---------------------------------------------- */}
        {/* Desktop: sticky inline 400px rail. Hidden on smaller screens — the
            mobile FocusDrawer below handles those via portal overlay. */}
        {selectedEvent && (
          <div className="hidden lg:flex">
            <CalendarFocusDrawer
              practiceId={practiceId ?? null}
              event={selectedEvent}
              onClose={handleDrawerClose}
              onMatterOpen={handleMatterClick}
            />
          </div>
        )}
      </div>

      {/* Mobile drawer presentation — lives outside the flex shell since it's
          a portal overlay (FocusDrawer mobile mode is gated to `lg:hidden`). */}
      {selectedEvent && (
        <div className="lg:hidden">
          <CalendarFocusDrawer
            practiceId={practiceId ?? null}
            event={selectedEvent}
            onClose={handleDrawerClose}
            onMatterOpen={handleMatterClick}
          />
        </div>
      )}
    </Page>
  );
}

export default PracticeCalendarPage;
