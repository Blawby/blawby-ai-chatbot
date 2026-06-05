import { EntityList } from '@/shared/ui/list/EntityList';
import { CalendarEventRow } from './CalendarEventRow';
import type { CalendarEvent } from '@/features/calendar/types';

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  onMatterClick?: (matterId: string) => void;
  onSelect?: (event: CalendarEvent) => void;
  selectedEventId?: string | null;
}

/**
 * Agenda view — a flat, chronologically ordered list of upcoming events.
 * Backed by EntityList for virtualization + skeleton/error/empty consistency.
 *
 * Row selection drives the right focus drawer in the parent page — we don't
 * use EntityList's own selection model because rows must remain non-clickable
 * for the matter chip (which routes to matter detail instead).
 */
export function CalendarAgendaView({
  events,
  isLoading,
  error,
  onMatterClick,
  onSelect,
  selectedEventId = null
}: CalendarAgendaViewProps) {
  return (
    <div className="h-[640px] overflow-hidden rounded-md border border-rule bg-card">
      <EntityList
        items={events}
        isLoading={isLoading}
        error={error}
        // Row select is handled by the per-row button inside CalendarEventRow
        // so EntityList's outer onSelect is a no-op.
        onSelect={() => undefined}
        renderItem={(event) => (
          <CalendarEventRow
            event={event}
            onMatterClick={onMatterClick}
            onSelect={onSelect}
            isActive={selectedEventId === event.id}
          />
        )}
        emptyState={
          <div className="p-8 text-center">
            <p className="font-serif text-xl text-ink">No upcoming events</p>
            <p className="mt-2 text-sm text-dim-2">
              The calendar aggregates task due dates, time entries, engagement
              lifecycle, invoice due dates, court dates and matter milestones.
              Add a task with a due date to see it here.
            </p>
          </div>
        }
      />
    </div>
  );
}
