import { useMemo } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/types';

/**
 * Filterable kinds for the calendar — a strict subset of CalendarEventKind.
 * "time" entries are not surfaced as a filter chip (they're billing-side noise
 * on this page).
 */
export type CalendarFilterKind =
  | 'court'
  | 'task'
  | 'engagement'
  | 'invoice'
  | 'milestone';

const FILTER_ORDER: ReadonlyArray<{ kind: CalendarFilterKind; label: string }> = [
  { kind: 'court', label: 'Court' },
  { kind: 'task', label: 'Deadlines' },
  { kind: 'milestone', label: 'Milestones' },
  { kind: 'engagement', label: 'Engagements' },
  { kind: 'invoice', label: 'Invoices' }
];

interface CalendarFilterChipsProps {
  events: CalendarEvent[];
  /** Currently-active filter kinds. Empty set === "All". */
  active: ReadonlySet<CalendarFilterKind>;
  onToggle: (kind: CalendarFilterKind) => void;
  onClear: () => void;
}

/**
 * Multi-select filter chip row above the calendar views. "All" is always the
 * first chip and acts as a reset — tapping it clears the active set. Tapping
 * any other chip toggles it in/out of the set.
 *
 * Counts are derived from `events` so the chip badges stay in sync with the
 * aggregated source totals (not the post-filter visible set — counts always
 * reflect the underlying corpus).
 */
export function CalendarFilterChips({
  events,
  active,
  onToggle,
  onClear
}: CalendarFilterChipsProps) {
  const counts = useMemo(() => {
    const map: Record<CalendarEventKind, number> = {
      task: 0,
      time: 0,
      engagement: 0,
      invoice: 0,
      court: 0,
      milestone: 0
    };
    for (const event of events) {
      map[event.kind] += 1;
    }
    return map;
  }, [events]);

  const total = events.length;
  const allActive = active.size === 0;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Filter calendar events by kind"
    >
      <button
        type="button"
        onClick={onClear}
        aria-pressed={allActive}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors',
          allActive
            ? 'border-ink bg-ink text-paper'
            : 'border-rule bg-card text-dim hover:border-ink-3 hover:text-ink-2'
        )}
      >
        All
        <span className={cn('font-mono', allActive ? 'text-accent' : 'text-accent')}>
          {total}
        </span>
      </button>

      {FILTER_ORDER.map(({ kind, label }) => {
        const isActive = active.has(kind);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onToggle(kind)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors',
              isActive
                ? 'border-ink bg-ink text-paper'
                : 'border-rule bg-card text-dim hover:border-ink-3 hover:text-ink-2'
            )}
          >
            {label}
            <span className="font-mono text-accent">{counts[kind]}</span>
          </button>
        );
      })}
    </div>
  );
}
