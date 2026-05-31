/**
 * Calendar events — unified shape across the four source systems.
 *
 * There is no dedicated "calendar event" table; this view AGGREGATES from:
 *   - task    : matter task due_date
 *   - time    : matter time entry start_time
 *   - engagement : engagement contract sent_at / accepted_at
 *   - invoice : invoice dueDate
 *
 * Each event is rendered onto the calendar grid by `date` (ISO yyyy-mm-dd or
 * full ISO instant). Sources that aren't backed by a backend field (court
 * dates, hearings, prep deadlines) are simply not present here — surfacing
 * them would require a new backend table.
 */

export type CalendarEventKind = 'task' | 'time' | 'engagement' | 'invoice';

export type CalendarEventPriority = 'low' | 'normal' | 'high' | 'urgent';

export type CalendarEventStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'paid'
  | 'overdue'
  | 'open'
  | (string & {});

export interface CalendarEvent {
  /** Stable id — `${kind}:${sourceId}` so React keys don't collide across kinds. */
  id: string;
  kind: CalendarEventKind;
  /** Short label, e.g. task name, invoice number, "Engagement sent". */
  title: string;
  /** ISO date (yyyy-mm-dd) or full ISO instant. Source of truth for placement. */
  date: string;
  /** Optional end time (only relevant for time entries today). */
  endDate?: string | null;
  /** Matter context (id + display title) when the event traces to one. */
  matterId?: string | null;
  matterTitle?: string | null;
  /** Task priority — drives the urgent/warn coloring on the event chip. */
  priority?: CalendarEventPriority | null;
  /** Lifecycle status — drives past/done styling. */
  status?: CalendarEventStatus | null;
  /** Deep-link target (e.g. matter detail page). */
  sourceUrl?: string | null;
}
