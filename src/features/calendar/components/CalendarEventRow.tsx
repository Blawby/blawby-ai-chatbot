import { Pill } from '@/design-system/primitives/Pill';
import { MatterChip } from '@/design-system/patterns';
import { cn } from '@/shared/utils/cn';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/types';

interface CalendarEventRowProps {
  event: CalendarEvent;
  onMatterClick?: (matterId: string) => void;
}

const KIND_LABELS: Record<CalendarEventKind, string> = {
  task: 'Task',
  time: 'Time',
  engagement: 'Engagement',
  invoice: 'Invoice'
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parseDate = (value: string): Date | null => {
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatTime = (date: Date): string =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });

const isUrgent = (event: CalendarEvent): boolean => {
  if (event.priority === 'urgent' || event.priority === 'high') return true;
  if (event.status === 'overdue') return true;
  return false;
};

const isPast = (date: Date): boolean => date.getTime() < Date.now();

/**
 * Single row in the agenda list: stacked date column, kind glyph, title +
 * matter context, and an urgency-aware pill. Mirrors the `.up-row` shape
 * from the design handoff while staying inside DS tokens.
 */
export function CalendarEventRow({ event, onMatterClick }: CalendarEventRowProps) {
  const parsed = parseDate(event.date);
  const dayName = parsed ? DAY_NAMES[parsed.getDay()] : '';
  const dayNum = parsed ? parsed.getDate().toString() : '—';
  const time = parsed && /T/.test(event.date) ? formatTime(parsed) : null;
  const past = parsed ? isPast(parsed) : false;
  const urgent = isUrgent(event);

  return (
    <div
      className={cn(
        'grid grid-cols-[80px_1fr_auto] items-center gap-5 border-b border-rule px-5 py-4 last:border-b-0',
        past && 'opacity-60'
      )}
    >
      <div className="flex flex-col">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">{dayName}</span>
        <span
          className={cn(
            'font-serif text-2xl leading-none tracking-tight',
            urgent ? 'text-neg' : 'text-ink'
          )}
        >
          {dayNum}
        </span>
        {time && (
          <span className="mt-1 font-mono text-[11px] tabular-nums text-ink-2">{time}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <Pill tone={urgent ? 'urgent' : 'dim'} dot={urgent}>
            {KIND_LABELS[event.kind]}
          </Pill>
          {event.priority && event.priority !== 'normal' && (
            <Pill tone={event.priority === 'urgent' ? 'urgent' : event.priority === 'high' ? 'warn' : 'dim'}>
              {event.priority}
            </Pill>
          )}
          {event.status && event.status !== 'pending' && (
            <Pill tone="dim">{event.status}</Pill>
          )}
        </div>
        <div className="font-serif text-base leading-tight tracking-tight text-ink truncate">
          {event.title}
        </div>
        {event.matterId && event.matterTitle && (
          <div>
            <MatterChip
              urgent={urgent}
              onClick={onMatterClick ? () => onMatterClick(event.matterId as string) : undefined}
            >
              {event.matterTitle}
            </MatterChip>
          </div>
        )}
      </div>

      <div className="font-mono text-xs text-dim">
        {past ? 'past' : 'upcoming'}
      </div>
    </div>
  );
}
