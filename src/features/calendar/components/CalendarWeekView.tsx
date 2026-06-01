import { useMemo } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/types';

interface CalendarWeekViewProps {
  /** Any date within the week to display. */
  anchor: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  /** Id of the currently focused event — rendered with the active ring. */
  selectedEventId?: string | null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const KIND_BORDER: Record<CalendarEventKind, string> = {
  task: 'border-l-2 border-l-warn',
  time: 'border-l-2 border-l-accent',
  engagement: 'border-l-2 border-l-pos',
  invoice: 'border-l-2 border-l-neg',
  court: 'border-l-2 border-l-neg',
  milestone: 'border-l-2 border-l-pos'
};

const KIND_TIME_COLOR: Record<CalendarEventKind, string> = {
  task: 'text-warn',
  time: 'text-accent-deep',
  engagement: 'text-pos',
  invoice: 'text-neg',
  court: 'text-neg',
  milestone: 'text-pos'
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

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const startOfWeek = (date: Date): Date => {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
};

/**
 * Week strip — 7-column grid covering the calendar week containing `anchor`.
 * Mirrors the `.week` shape from the design handoff but uses CSS grid + DS
 * tokens.
 */
export function CalendarWeekView({
  anchor,
  events,
  onEventClick,
  selectedEventId = null
}: CalendarWeekViewProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
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
    <div className="grid grid-cols-7 overflow-hidden rounded-md border border-rule bg-card shadow-sm">
      {days.map((day) => {
        const past = day.getTime() < today.getTime();
        const isToday = day.getTime() === today.getTime();
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        const dayKey = toDateKey(day);
        const dayEvents = eventsByDay.get(dayKey) ?? [];

        return (
          <div
            key={dayKey}
            className={cn(
              'flex min-h-[200px] flex-col gap-2 border-r border-rule p-3 last:border-r-0',
              weekend && 'bg-paper-2/40'
            )}
          >
            <div
              className={cn(
                'flex items-baseline justify-between border-b border-rule pb-2',
                past && !isToday && 'opacity-60'
              )}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                {DAY_NAMES[day.getDay()]}
              </span>
              <span
                className={cn(
                  'font-serif text-lg leading-none tracking-tight',
                  isToday ? 'text-accent-deep' : 'text-ink'
                )}
              >
                {day.getDate()}
                {isToday && (
                  <span
                    className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-top"
                    aria-label="Today"
                  />
                )}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {dayEvents.length === 0 ? (
                <div className="font-mono text-[10px] text-dim-2">—</div>
              ) : (
                dayEvents.map((event) => {
                  const parsed = parseDate(event.date);
                  const time = parsed && /T/.test(event.date) ? formatTime(parsed) : null;
                  const isActive = selectedEventId === event.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={onEventClick ? () => onEventClick(event) : undefined}
                      aria-pressed={isActive}
                      className={cn(
                        'flex flex-col gap-0.5 rounded-sm bg-paper px-2 py-1.5 text-left transition-colors hover:bg-paper-2',
                        KIND_BORDER[event.kind],
                        past && 'opacity-65',
                        isActive && 'ring-1 ring-ink shadow-1 bg-card opacity-100'
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
                      <span className="font-serif text-xs leading-tight text-ink line-clamp-2">
                        {event.title}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
