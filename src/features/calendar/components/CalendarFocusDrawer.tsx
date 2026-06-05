import { useEffect, useMemo, useState } from 'preact/hooks';
import { Calendar as CalendarIcon, ExternalLink } from 'lucide-preact';
import { FocusDrawer } from '@/design-system/layout';
import {
  NumberedSection,
  type NumberedSectionState
} from '@/design-system/primitives/NumberedSection';
import { StatStrip, Observation } from '@/design-system/patterns';
import { Button } from '@/shared/ui/Button';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import {
  listMatterTasks,
  type BackendMatterTask
} from '@/features/matters/services/mattersApi';
import type { CalendarEvent, CalendarEventKind } from '@/features/calendar/types';

const KIND_LABELS: Record<CalendarEventKind, string> = {
  task: 'Task due',
  time: 'Time entry',
  engagement: 'Engagement',
  invoice: 'Invoice',
  court: 'Court appearance',
  milestone: 'Matter milestone'
};

const KIND_PULSE = (kind: CalendarEventKind): boolean => kind === 'court';

const formatDateLong = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatTime = (iso: string): string | null => {
  if (!/T/.test(iso)) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  });
};

const formatCountdown = (iso: string): string | null => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const ms = parsed.getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0
    ? `in ${days} day${days === 1 ? '' : 's'} ${remHours} hour${remHours === 1 ? '' : 's'}`
    : `in ${days} day${days === 1 ? '' : 's'}`;
};

const buildObservation = (event: CalendarEvent): string => {
  switch (event.kind) {
    case 'court':
      return event.judge
        ? `Hearing before Judge ${event.judge}${event.court ? ` at ${event.court}` : ''}. Confirm exhibits and witness list are filed before the day-of.`
        : 'Court appearance approaching — confirm exhibits and witness list are filed.';
    case 'task': {
      if (event.priority === 'urgent') return 'Marked urgent — block time on the calendar before the day-of.';
      if (event.status === 'overdue') return 'This task is past due. Reprioritize or close it.';
      return 'Stay ahead of this deadline — the assistant can stage a prep block.';
    }
    case 'milestone':
      return 'Milestone hits soon — confirm deliverables are queued and the client is in the loop.';
    case 'engagement':
      if (event.subtype === 'expiry') return 'Engagement expires soon — nudge the client to sign or extend the offer.';
      if (event.subtype === 'sent') return 'Engagement is out for signature. Watch for the client view event.';
      return 'Engagement accepted — handoff to the responsible attorney.';
    case 'invoice':
      return 'Invoice due — confirm the client received it and schedule a follow-up if unpaid by EOD.';
    default:
      return 'The assistant will surface anything worth knowing here.';
  }
};

interface CalendarFocusDrawerProps {
  practiceId: string | null;
  event: CalendarEvent | null;
  onClose: () => void;
  onMatterOpen?: (matterId: string) => void;
}

/**
 * Right-side focus drawer for a single calendar event. Mirrors the
 * `.focus` aside from Calendar.html — kind pill + title + when-strip with
 * courtroom/judge/travel + observation strip + prep checklist (matter tasks
 * filtered to ≤ event date) + matter context card.
 *
 * Prep checklist is fetched lazily per-selection from the matter's task list
 * (one request per drawer open; no caching beyond React state). Tasks with
 * `due_date <= event.date` and `status !== 'completed'` render as the "next"
 * items; tasks already completed by the event date render as "done".
 */
export function CalendarFocusDrawer({
  practiceId,
  event,
  onClose,
  onMatterOpen
}: CalendarFocusDrawerProps) {
  const [tasks, setTasks] = useState<BackendMatterTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Reset + fetch prep tasks whenever the selected event changes.
  useEffect(() => {
    if (!event || !event.matterId || !practiceId) {
      setTasks([]);
      setTasksError(null);
      setTasksLoading(false);
      return;
    }
    const controller = new AbortController();
    setTasksLoading(true);
    setTasksError(null);
    listMatterTasks(practiceId, event.matterId, {}, { signal: controller.signal })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setTasks(rows);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if ((err as DOMException).name === 'AbortError') return;
        setTasksError(err instanceof Error ? err.message : 'Failed to load prep tasks');
      })
      .finally(() => {
        if (!controller.signal.aborted) setTasksLoading(false);
      });
    return () => controller.abort();
  }, [event, practiceId]);

  // Filter to tasks at or before the event date — these are the "prep" items.
  // Cap at the most relevant 5 so the drawer stays scannable.
  const prepTasks = useMemo(() => {
    if (!event) return [];
    const eventDate = new Date(event.date);
    if (Number.isNaN(eventDate.getTime())) return tasks.slice(0, 5);
    return tasks
      .filter((task) => {
        if (!task.due_date) return false;
        const taskDate = new Date(task.due_date);
        if (Number.isNaN(taskDate.getTime())) return false;
        return taskDate.getTime() <= eventDate.getTime();
      })
      .sort((a, b) => {
        const ta = a.due_date ? new Date(a.due_date).getTime() : 0;
        const tb = b.due_date ? new Date(b.due_date).getTime() : 0;
        return ta - tb;
      })
      .slice(0, 5);
  }, [tasks, event]);

  const prepReadyCount = useMemo(
    () => prepTasks.filter((t) => t.status === 'completed').length,
    [prepTasks]
  );

  if (!event) return null;

  const dateLong = formatDateLong(event.date);
  const time = formatTime(event.date);
  const countdown = formatCountdown(event.date);
  const showPulse = KIND_PULSE(event.kind);

  // When-strip cells differ slightly by kind.
  const whenCells: Array<{ label: string; value: string }> = [];
  if (event.kind === 'court') {
    if (event.court) whenCells.push({ label: 'Courthouse', value: event.court });
    if (event.judge) whenCells.push({ label: 'Judge', value: event.judge });
    whenCells.push({ label: 'Travel', value: '~22 min' }); // TODO(backend): geocode + maps API
  } else {
    if (time) whenCells.push({ label: 'Time', value: time });
    whenCells.push({ label: 'Kind', value: KIND_LABELS[event.kind] });
    if (event.matterTitle) {
      whenCells.push({
        label: 'Matter',
        value: event.matterTitle.length > 18
          ? `${event.matterTitle.slice(0, 17)}…`
          : event.matterTitle
      });
    }
  }

  return (
    <FocusDrawer
      isOpen
      onClose={onClose}
      presentation="desktop"
      position="right"
      showCloseButton
      ariaLabel="Event focus drawer"
      title={KIND_LABELS[event.kind]}
    >
      <div className="flex flex-col gap-4">

        {/* Header — kind pill + serif H1 + when meta. Inline here (not in
            FocusDrawer's title/subtitle slots) so we get full styling control
            over the serif H1 and don't fight the title slot's CSS cascade. */}
        <header className="flex flex-col gap-2 pb-1">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            {showPulse && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-neg"
              />
            )}
            {KIND_LABELS[event.kind]}
          </span>
          <h2 className="m-0 font-serif text-[26px] font-normal leading-tight tracking-tight text-ink">
            {event.title}
          </h2>
          <p className="m-0 text-[13px] text-ink-2">
            {dateLong}
            {time && ` · ${time}`}
            {event.court && ` · ${event.court}`}
          </p>
          {countdown && (
            <p className="m-0 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-neg">
              {countdown}
              {prepTasks.length > 0 && ` · ${prepReadyCount} of ${prepTasks.length} prep items ready`}
            </p>
          )}
        </header>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary">
            Open prep packet
          </Button>
          {event.matterId && onMatterOpen && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onMatterOpen(event.matterId as string)}
              icon={ExternalLink}
              iconPosition="right"
            >
              Open matter
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={CalendarIcon}>
            Add to calendar
          </Button>
        </div>

        {/* When-strip */}
        {whenCells.length > 0 && (
          <StatStrip
            cells={whenCells.map((cell) => ({
              label: cell.label,
              value: <span className="font-serif text-lg leading-none tracking-tight">{cell.value}</span>
            }))}
          />
        )}

        {/* Observation — deterministic, kind-aware. TODO(backend) for live AI. */}
        <Observation
          label="I noticed"
          actions={
            <>
              <Button size="sm" variant="primary">Stage request</Button>
              <Button size="sm" variant="secondary">Add prep block</Button>
            </>
          }
        >
          {buildObservation(event)}
        </Observation>

        {/* Prep checklist */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              Prep checklist
            </h3>
            {tasks.length > prepTasks.length && (
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
                {tasks.length - prepTasks.length} more on matter
              </span>
            )}
          </div>

          {tasksLoading && (
            <LoadingBlock
              size="sm"
              label="Loading prep tasks"
              minDurationMs={150}
              className="min-h-[48px]"
            />
          )}
          {tasksError && (
            <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-neg">
              {tasksError}
            </p>
          )}
          {!tasksLoading && !tasksError && prepTasks.length === 0 && (
            <p className="text-sm italic text-dim-2">
              No prep tasks queued. Tasks linked to this matter with a due
              date ≤ event date will appear here.
            </p>
          )}

          {prepTasks.length > 0 && (
            <div className="flex flex-col gap-2 rounded-r-md border border-rule bg-card p-3">
              {prepTasks.map((task, index) => {
                const isDone = task.status === 'completed';
                const state: NumberedSectionState = isDone ? 'done' : 'next';
                const dueLabel = task.due_date
                  ? formatDateLong(task.due_date)
                  : 'no due date';
                return (
                  <NumberedSection
                    key={task.id}
                    number={index + 1}
                    state={state}
                    title={task.name}
                    description={`Due ${dueLabel}${task.priority && task.priority !== 'normal' ? ` · ${task.priority}` : ''}`}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Matter context card */}
        {event.matterId && event.matterTitle && (
          <section className="flex flex-col gap-2">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              Matter
            </h3>
            <article className="flex flex-col gap-2 rounded-r-md border border-rule bg-card p-3.5">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
                Active matter
              </span>
              <h4 className="font-serif text-[19px] font-normal leading-tight tracking-tight text-ink">
                {event.matterTitle}
              </h4>
              {event.clientName && (
                <p className="text-[12.5px] text-ink-2">{event.clientName}</p>
              )}
              <div className="flex gap-1.5">
                {onMatterOpen && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onMatterOpen(event.matterId as string)}
                  >
                    Open
                  </Button>
                )}
              </div>
            </article>
          </section>
        )}

        {/* Footer — source attribution. */}
        <div className="mt-2 border-t border-rule pt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-dim-2">
          Calendar sources · tasks · milestones · engagements · invoices · matters
          {/* TODO(backend): wire to PracticeAssistantQueryEngine for live grounding labels. */}
        </div>

      </div>
    </FocusDrawer>
  );
}
