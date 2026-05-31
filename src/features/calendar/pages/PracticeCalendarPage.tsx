import { useMemo, useState, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Button } from '@/shared/ui/Button';
import { AISummary, Seg, type SegOption } from '@/design-system/patterns';
import { Pill } from '@/design-system/primitives/Pill';
import { ChevronLeft, ChevronRight } from 'lucide-preact';
import { useCalendarEvents } from '@/features/calendar/services/useCalendarEvents';
import { CalendarMonthView } from '@/features/calendar/components/CalendarMonthView';
import { CalendarWeekView } from '@/features/calendar/components/CalendarWeekView';
import { CalendarAgendaView } from '@/features/calendar/components/CalendarAgendaView';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/types';

type ViewMode = 'month' | 'week' | 'agenda';

const VIEW_OPTIONS: ReadonlyArray<SegOption<ViewMode>> = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'agenda', label: 'Agenda' }
];

const KIND_LABELS: Record<CalendarEventKind, string> = {
  task: 'Task due',
  time: 'Time logged',
  engagement: 'Engagement',
  invoice: 'Invoice due'
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

interface PracticeCalendarPageProps {
  /** Practice id resolved from the route (`/practice/:slug/calendar`). */
  practiceId?: string | null;
  /** Slug used for matter deep-links — falls back to the URL on undefined. */
  practiceSlug?: string | null;
}

/**
 * Calendar deadlines aggregation screen — `/practice/:slug/calendar`.
 *
 * Aggregates from four existing source systems (no dedicated calendar
 * backend exists):
 *   - Task `due_date` (matter-scoped)
 *   - Time entry `start_time` (matter-scoped)
 *   - Engagement contract `sent_at` + `accepted_at` (practice-scoped)
 *   - Invoice `dueDate` (practice-scoped)
 *
 * Court dates, hearings, and prep-list deadlines are NOT surfaced because no
 * backend table currently stores them. They appear in the design handoff but
 * land in the next backend pass.
 */
export function PracticeCalendarPage({
  practiceId,
  practiceSlug
}: PracticeCalendarPageProps) {
  const location = useLocation();
  const navigate = useCallback((path: string) => location.route(path), [location]);

  const [view, setView] = useState<ViewMode>('agenda');
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));

  const { events, isLoading, error, truncated, refresh } = useCalendarEvents(practiceId ?? null);

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return events
      .filter((event) => {
        const parsed = parseEventDate(event.date);
        return parsed ? parsed.getTime() >= today : false;
      });
  }, [events]);

  const counts = useMemo(() => {
    const result: Record<CalendarEventKind, number> = {
      task: 0,
      time: 0,
      engagement: 0,
      invoice: 0
    };
    for (const event of upcomingEvents) {
      result[event.kind] += 1;
    }
    return result;
  }, [upcomingEvents]);

  const urgent = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const horizon = today + 7 * 24 * 60 * 60 * 1000;
    return events.filter((event) => {
      const parsed = parseEventDate(event.date);
      if (!parsed) return false;
      const time = parsed.getTime();
      if (time < today || time > horizon) return false;
      return event.priority === 'urgent' || event.priority === 'high' || event.status === 'overdue';
    });
  }, [events]);

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

  const slug = (practiceSlug ?? '').trim();
  const handleMatterClick = useCallback((matterId: string) => {
    if (!slug) return;
    navigate(`/practice/${encodeURIComponent(slug)}/matters/${encodeURIComponent(matterId)}`);
  }, [navigate, slug]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    if (event.matterId && slug) {
      navigate(`/practice/${encodeURIComponent(slug)}/matters/${encodeURIComponent(event.matterId)}`);
    }
  }, [navigate, slug]);

  const navLabel =
    view === 'month' ? monthLabel(anchor)
      : view === 'week' ? weekLabel(anchor)
        : anchor.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const summaryLede = urgent.length > 0
    ? <>You have <em>{urgent.length} urgent {urgent.length === 1 ? 'item' : 'items'}</em> due in the next 7 days.</>
    : upcomingEvents.length > 0
      ? <>{upcomingEvents.length} upcoming {upcomingEvents.length === 1 ? 'item' : 'items'} aggregated across matters, time entries, engagements, and invoices.</>
      : <>No upcoming deadlines. The calendar updates as tasks, time entries, engagements, and invoices land.</>;

  return (
    <Page padded={false} className="flex h-full flex-col">
      <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          crumb="Calendar · deadlines"
          title="What this week wants from you."
          subtitle="Tasks, time, engagements, and invoices — aggregated from across the practice."
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={refresh} disabled={isLoading}>
                {isLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          }
        />

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

        <AISummary
          label="Upcoming deadlines"
          verifier={`grounded in ${events.length} ${events.length === 1 ? 'event' : 'events'}`}
        >
          {summaryLede}
        </AISummary>

        <div className="flex flex-wrap items-center gap-3">
          <Pill tone="dim">
            {counts.task} {KIND_LABELS.task.toLowerCase()}{counts.task === 1 ? '' : 's'}
          </Pill>
          <Pill tone="dim">
            {counts.time} time {counts.time === 1 ? 'entry' : 'entries'}
          </Pill>
          <Pill tone="dim">
            {counts.engagement} engagement {counts.engagement === 1 ? 'event' : 'events'}
          </Pill>
          <Pill tone="dim">
            {counts.invoice} invoice{counts.invoice === 1 ? '' : 's'} due
          </Pill>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Seg<ViewMode>
            value={view}
            options={VIEW_OPTIONS}
            onChange={setView}
            ariaLabel="Calendar view mode"
          />

          {view !== 'agenda' && (
            <div className="flex items-center gap-2">
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
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-ink px-2">
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
            </div>
          )}
        </div>

        {view === 'month' && (
          <CalendarMonthView
            anchor={anchor}
            events={events}
            onEventClick={handleEventClick}
          />
        )}

        {view === 'week' && (
          <CalendarWeekView
            anchor={anchor}
            events={events}
            onEventClick={handleEventClick}
          />
        )}

        {view === 'agenda' && (
          <CalendarAgendaView
            events={upcomingEvents}
            isLoading={isLoading}
            error={error}
            onMatterClick={handleMatterClick}
          />
        )}
      </div>
    </Page>
  );
}

export default PracticeCalendarPage;
