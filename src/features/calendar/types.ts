/**
 * Calendar events — unified shape across the four source systems.
 *
 * There is no dedicated "calendar event" table; this view AGGREGATES from:
 *   - task       : matter task due_date
 *   - time       : matter time entry start_time
 *   - engagement : engagement contract sent_at / accepted_at / sent_at+30d expiry
 *   - invoice    : invoice dueDate
 *   - court      : matter court_date (backend passthrough — present only when
 *                  the backend ships it on the matter wire row; otherwise zero
 *                  events of this kind)
 *   - milestone  : matter milestone due_date (matter-scoped, fanned out)
 *
 * Each event is rendered onto the calendar grid by `date` (ISO yyyy-mm-dd or
 * full ISO instant).
 */

export type CalendarEventKind =
  | 'task'
  | 'time'
  | 'engagement'
  | 'invoice'
  | 'court'
  | 'milestone';

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
  | 'expiring'
  | (string & {});

/**
 * Optional finer-grained subtype within a kind — currently used for engagement
 * events ('sent' | 'accepted' | 'expiry') so the focus drawer can render the
 * right copy without re-parsing the event id.
 */
export type CalendarEventSubtype = 'sent' | 'accepted' | 'expiry' | (string & {});

export interface CalendarEvent {
  /** Stable id — `${kind}:${sourceId}` so React keys don't collide across kinds. */
  id: string;
  kind: CalendarEventKind;
  /** Optional finer subtype within a kind. */
  subtype?: CalendarEventSubtype | null;
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
  /** Courthouse name (court events only). */
  court?: string | null;
  /** Presiding judge (court events only). */
  judge?: string | null;
  /** Client name (best-effort — derived from matter context). */
  clientName?: string | null;
}
