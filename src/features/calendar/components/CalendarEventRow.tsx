import { Pill } from '@/design-system/primitives/Pill';
import { MatterChip } from '@/design-system/patterns';
import { cn } from '@/shared/utils/cn';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/types';

interface CalendarEventRowProps {
  event: CalendarEvent;
  onMatterClick?: (matterId: string) => void;
  onSelect?: (event: CalendarEvent) => void;
  /** When true, renders the row with the accent left-bar + active background. */
  isActive?: boolean;
}

const KIND_LABELS: Record<CalendarEventKind, string> = {
  task: 'Task',
  time: 'Time',
  engagement: 'Engagement',
  invoice: 'Invoice',
  court: 'Court',
  milestone: 'Milestone'
};

// Single-character glyph per kind — mirrors the design handoff `.up-glyph` shape.
const KIND_GLYPH: Record<CalendarEventKind, string> = {
  task: '!',
  time: '⏱',
  engagement: '§',
  invoice: '$',
  court: '§',
  milestone: '✓'
};

// Glyph tint per kind — matches the .up-glyph.{court,deadline,call,milestone}
// color tokens from the design handoff (translated to Tailwind alpha utilities).
const KIND_GLYPH_TONE: Record<CalendarEventKind, string> = {
  task: 'bg-warn/10 border-warn/30 text-warn',
  time: 'bg-paper-2 border-rule text-ink-2',
  engagement: 'bg-pos/10 border-pos/30 text-pos',
  invoice: 'bg-neg/10 border-neg/30 text-neg',
  court: 'bg-neg/10 border-neg/30 text-neg',
  milestone: 'bg-pos/10 border-pos/30 text-pos'
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parseDate = (value: string): Date | null => {
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatTime = (date: Date): string =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });

const formatCountdown = (target: Date): string => {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return 'now';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`;
};

const isUrgent = (event: CalendarEvent): boolean => {
  if (event.kind === 'court') return true;
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
export function CalendarEventRow({
  event,
  onMatterClick,
  onSelect,
  isActive = false
}: CalendarEventRowProps) {
  const parsed = parseDate(event.date);
  const dayName = parsed ? DAY_NAMES[parsed.getDay()] : '';
  const dayNum = parsed ? parsed.getDate().toString() : '—';
  const time = parsed && /T/.test(event.date) ? formatTime(parsed) : null;
  const past = parsed ? isPast(parsed) : false;
  const urgent = isUrgent(event);
  const countdown = parsed && !past ? formatCountdown(parsed) : null;

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(event) : undefined}
      aria-pressed={isActive}
      className={cn(
        'relative grid w-full grid-cols-[80px_40px_1fr_auto] items-center gap-4 border-b border-rule px-5 py-4 text-left last:border-b-0 transition-colors',
        past && 'opacity-60',
        !past && !isActive && 'hover:bg-paper-2',
        isActive && 'bg-accent/10'
      )}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-accent"
        />
      )}

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

      <div
        aria-hidden="true"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border font-serif text-sm italic',
          KIND_GLYPH_TONE[event.kind]
        )}
      >
        {KIND_GLYPH[event.kind]}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
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
          {event.kind === 'court' && event.court && (
            <Pill tone="dim">{event.court}</Pill>
          )}
        </div>
        <div className="truncate font-serif text-base leading-tight tracking-tight text-ink">
          {event.title}
        </div>
        {event.matterId && event.matterTitle && (
          <div>
            <MatterChip
              urgent={urgent}
              onClick={
                onMatterClick
                  ? (e) => {
                      e.stopPropagation();
                      onMatterClick(event.matterId as string);
                    }
                  : undefined
              }
            >
              {event.matterTitle}
              {event.kind === 'court' && event.judge ? ` · Judge ${event.judge}` : ''}
            </MatterChip>
          </div>
        )}
      </div>

      <div className="text-right font-mono text-xs text-dim">
        <div>{past ? 'past' : 'upcoming'}</div>
        {countdown && (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-dim-2">
            {countdown}
          </div>
        )}
      </div>
    </button>
  );
}
