import { useMemo } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/types';

interface CalendarMonthViewProps {
  /** Anchor date — the view shows the calendar month containing this date. */
  anchor: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const KIND_BORDER: Record<CalendarEventKind, string> = {
  task: 'border-l-2 border-l-warn',
  time: 'border-l-2 border-l-accent',
  engagement: 'border-l-2 border-l-pos',
  invoice: 'border-l-2 border-l-neg'
};

const KIND_TIME_COLOR: Record<CalendarEventKind, string> = {
  task: 'text-warn',
  time: 'text-accent-deep',
  engagement: 'text-pos',
  invoice: 'text-neg'
};

const parseDate = (value: string): Date | null => {
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTime = (date: Date): string =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/**
 * Month view — CSS grid (not <table>) of 7 columns × N rows. Each cell holds
 * the day number plus up to three stacked event chips, color-coded by kind.
 */
export function CalendarMonthView({ anchor, events, onEventClick }: CalendarMonthViewProps) {
  const today = useMemo(() => startOfDay(new Date()), []);

  const grid = useMemo(() => {
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const days: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor.getTime() <= gridEnd.getTime()) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { days, monthStart, monthEnd };
  }, [anchor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const parsed = parseDate(event.date);
      if (!parsed) continue;
      const key = toDateKey(parsed);
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }
    return map;
  }, [events]);

  return (
    <div className="overflow-hidden rounded-md border border-rule bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b border-rule bg-paper-2">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim text-center"
          >
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.days.map((day) => {
          const inMonth = day.getMonth() === grid.monthStart.getMonth();
          const past = day.getTime() < today.getTime();
          const isToday = day.getTime() === today.getTime();
          const weekend = isWeekend(day);
          const dayKey = toDateKey(day);
          const dayEvents = eventsByDay.get(dayKey) ?? [];
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={dayKey}
              className={cn(
                'flex min-h-[120px] flex-col gap-1.5 border-b border-r border-rule p-2',
                weekend && 'bg-paper-2/40',
                !inMonth && 'opacity-40',
                past && inMonth && 'bg-card'
              )}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={cn(
                    'font-serif text-base leading-none tracking-tight',
                    isToday ? 'text-accent-deep' : 'text-ink',
                    past && !isToday && 'text-dim-2'
                  )}
                >
                  {day.getDate()}
                </span>
                {isToday && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
                    aria-label="Today"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1">
                {visible.map((event) => {
                  const parsed = parseDate(event.date);
                  const time = parsed && /T/.test(event.date) ? formatTime(parsed) : null;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={onEventClick ? () => onEventClick(event) : undefined}
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-sm bg-paper px-2 py-1 text-left transition-colors hover:bg-paper-2',
                        KIND_BORDER[event.kind]
                      )}
                    >
                      {time && (
                        <span
                          className={cn(
                            'font-mono text-[9.5px] uppercase tracking-[0.06em]',
                            KIND_TIME_COLOR[event.kind]
                          )}
                        >
                          {time}
                        </span>
                      )}
                      <span className="font-serif text-xs leading-tight text-ink line-clamp-1">
                        {event.title}
                      </span>
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <div className="font-mono text-[10px] uppercase tracking-wide text-dim">
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
