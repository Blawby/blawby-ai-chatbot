import { EntityList } from '@/shared/ui/list/EntityList';
import { CalendarEventRow } from './CalendarEventRow';
import type { CalendarEvent } from '@/features/calendar/types';

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  onMatterClick?: (matterId: string) => void;
}

/**
 * Agenda view — a flat, chronologically ordered list of upcoming events.
 * Backed by EntityList for virtualization + skeleton/error/empty consistency.
 */
export function CalendarAgendaView({
  events,
  isLoading,
  error,
  onMatterClick
}: CalendarAgendaViewProps) {
  return (
    <div className="overflow-hidden rounded-md border border-rule bg-card h-[640px]">
      <EntityList
        items={events}
        isLoading={isLoading}
        error={error}
        // We don't drive selection from the agenda — clicking the row is a
        // no-op here, but the matter chip inside each row routes to the
        // matter detail page.
        onSelect={() => undefined}
        renderItem={(event) => (
          <CalendarEventRow event={event} onMatterClick={onMatterClick} />
        )}
        emptyState={
          <div className="p-8 text-center">
            <p className="font-serif text-xl text-ink">No upcoming events</p>
            <p className="mt-2 text-sm text-dim-2">
              The calendar aggregates task due dates, time entries, engagement
              lifecycle events, and invoice due dates. Add a task with a due
              date to see it here.
            </p>
          </div>
        }
      />
    </div>
  );
}
