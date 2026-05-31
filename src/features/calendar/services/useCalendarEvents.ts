import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  listMatters,
  listMatterTasks,
  listMatterTimeEntries,
  type BackendMatter
} from '@/features/matters/services/mattersApi';
import { listEngagements } from '@/features/engagements/api/engagementsApi';
import { listAllPracticeInvoiceSummaries } from '@/features/invoices/services/invoicesService';
import type {
  CalendarEvent,
  CalendarEventPriority,
  CalendarEventStatus
} from '@/features/calendar/types';

const MATTERS_PAGE_SIZE = 50;
const MAX_MATTERS_PAGES = 40;

type UseCalendarEventsResult = {
  events: CalendarEvent[];
  matters: BackendMatter[];
  isLoading: boolean;
  error: string | null;
  /**
   * True when the matters list at the API ceiling — the fan-out below
   * skipped any matters beyond the cap, so events from those matters are
   * silently absent from the screen.
   */
  truncated: boolean;
  refresh: () => void;
};

const buildMatterTitle = (matter: BackendMatter): string => {
  const raw = (matter.title ?? '').toString().trim();
  return raw.length > 0 ? raw : 'Untitled matter';
};

const isMeaningfulDate = (value: string | null | undefined): value is string => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const coercePriority = (value: unknown): CalendarEventPriority | null => {
  if (value === 'low' || value === 'normal' || value === 'high' || value === 'urgent') {
    return value;
  }
  return null;
};

const coerceStatus = (value: unknown): CalendarEventStatus | null => {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value as CalendarEventStatus;
};

/**
 * Aggregates calendar events from the four backend sources.
 *
 * Tasks and time entries are matter-scoped, so the hook fans out across the
 * practice's matters and tolerates per-matter failures. N+1 risk is real:
 * one request per matter for tasks + one for time entries. The shape mirrors
 * `useTasks`, which already lives with the same constraint. If/when a
 * backend `/api/practices/:id/{tasks,time-entries}` aggregation endpoint
 * ships, replace the per-matter fan-outs here with a single fetch each.
 *
 * Engagement contracts and invoices already have practice-scoped list
 * endpoints, so those are a single request each.
 */
export const useCalendarEvents = (practiceId: string | null | undefined): UseCalendarEventsResult => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!practiceId) {
      setEvents([]);
      setMatters([]);
      setIsLoading(false);
      setError(null);
      setTruncated(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    setIsLoading(true);
    setError(null);
    setTruncated(false);

    const run = async () => {
      try {
        // 1. Paginate matters (capped) so we know which matter ids to fan out to.
        const allMatters: BackendMatter[] = [];
        let page = 1;
        let lastPageWasFull = false;
        for (let i = 0; i < MAX_MATTERS_PAGES; i += 1) {
          const pageItems = await listMatters(practiceId, {
            page,
            limit: MATTERS_PAGE_SIZE,
            signal
          });
          if (signal.aborted) return;
          allMatters.push(...pageItems);
          lastPageWasFull = pageItems.length === MATTERS_PAGE_SIZE;
          if (!lastPageWasFull) break;
          page += 1;
        }
        if (signal.aborted) return;
        setMatters(allMatters);
        setTruncated(lastPageWasFull && page >= MAX_MATTERS_PAGES);

        const titleByMatterId = new Map<string, string>();
        allMatters.forEach((matter) => {
          titleByMatterId.set(matter.id, buildMatterTitle(matter));
        });

        // 2. Fan out tasks + time entries per matter, and fetch engagements +
        //    invoices once at the practice level — in parallel.
        const [tasksResults, timeResults, engagementsResult, invoicesResult] = await Promise.all([
          Promise.allSettled(
            allMatters.map((matter) =>
              listMatterTasks(practiceId, matter.id, {}, { signal })
            )
          ),
          Promise.allSettled(
            allMatters.map((matter) =>
              listMatterTimeEntries(practiceId, matter.id, { signal })
            )
          ),
          listEngagements(practiceId, { page: 1, limit: 100 }, { signal })
            .catch((err) => {
              if ((err as DOMException).name === 'AbortError') throw err;
              console.warn('[useCalendarEvents] Failed to load engagements', err);
              return null;
            }),
          listAllPracticeInvoiceSummaries(practiceId, { signal })
            .catch((err) => {
              if ((err as DOMException).name === 'AbortError') throw err;
              console.warn('[useCalendarEvents] Failed to load invoices', err);
              return null;
            })
        ]);
        if (signal.aborted) return;

        const merged: CalendarEvent[] = [];

        // — Tasks: one event per task with a due_date.
        tasksResults.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const matter = allMatters[index];
          if (!matter) return;
          const matterTitle = titleByMatterId.get(matter.id) ?? null;
          for (const task of result.value) {
            if (!isMeaningfulDate(task.due_date)) continue;
            merged.push({
              id: `task:${task.id}`,
              kind: 'task',
              title: task.name,
              date: task.due_date,
              matterId: matter.id,
              matterTitle,
              priority: coercePriority(task.priority),
              status: coerceStatus(task.status),
              sourceUrl: `/practice/__slug__/matters/${encodeURIComponent(matter.id)}/work/tasks`
            });
          }
        });

        // — Time entries: one event per entry, anchored at start_time.
        timeResults.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const matter = allMatters[index];
          if (!matter) return;
          const matterTitle = titleByMatterId.get(matter.id) ?? null;
          for (const entry of result.value) {
            if (!isMeaningfulDate(entry.start_time)) continue;
            merged.push({
              id: `time:${entry.id}`,
              kind: 'time',
              title: entry.description?.trim() || 'Logged time',
              date: entry.start_time,
              endDate: entry.end_time ?? null,
              matterId: matter.id,
              matterTitle,
              sourceUrl: `/practice/__slug__/matters/${encodeURIComponent(matter.id)}/billing/time`
            });
          }
        });

        // — Engagement contracts: emit "sent" + "accepted" anchor events when
        //   those lifecycle dates are present. The current backend wire shape
        //   does not include an `expires_at` field, so expiry events are not
        //   surfaced (see component-level docs).
        if (engagementsResult && 'items' in engagementsResult) {
          for (const engagement of engagementsResult.items) {
            const matterTitle = engagement.matter_id
              ? titleByMatterId.get(engagement.matter_id) ?? engagement.title ?? null
              : engagement.title ?? null;
            if (isMeaningfulDate(engagement.sent_at)) {
              merged.push({
                id: `engagement:${engagement.id}:sent`,
                kind: 'engagement',
                title: `Engagement sent · ${engagement.client_name ?? 'client'}`,
                date: engagement.sent_at,
                matterId: engagement.matter_id ?? null,
                matterTitle,
                status: 'sent'
              });
            }
            if (isMeaningfulDate(engagement.accepted_at)) {
              merged.push({
                id: `engagement:${engagement.id}:accepted`,
                kind: 'engagement',
                title: `Engagement accepted · ${engagement.client_name ?? 'client'}`,
                date: engagement.accepted_at,
                matterId: engagement.matter_id ?? null,
                matterTitle,
                status: 'accepted'
              });
            }
          }
        }

        // — Invoices: one event per invoice with a dueDate.
        if (Array.isArray(invoicesResult)) {
          for (const invoice of invoicesResult) {
            if (!isMeaningfulDate(invoice.dueDate)) continue;
            const matterTitle = invoice.matterId
              ? titleByMatterId.get(invoice.matterId) ?? invoice.matterTitle ?? null
              : invoice.matterTitle ?? null;
            merged.push({
              id: `invoice:${invoice.id}`,
              kind: 'invoice',
              title: `Invoice ${invoice.invoiceNumber} due`,
              date: invoice.dueDate,
              matterId: invoice.matterId ?? null,
              matterTitle,
              status: coerceStatus(invoice.status)
            });
          }
        }

        // Stable ordering by date asc.
        merged.sort((a, b) => {
          const ta = new Date(a.date).getTime();
          const tb = new Date(b.date).getTime();
          return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
        });

        setEvents(merged);
      } catch (err) {
        if (signal.aborted) return;
        if ((err as DOMException).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load calendar events');
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [practiceId, reloadTick]);

  return useMemo(
    () => ({
      events,
      matters,
      isLoading,
      error,
      truncated,
      refresh: () => setReloadTick((tick) => tick + 1)
    }),
    [events, matters, isLoading, error, truncated]
  );
};
