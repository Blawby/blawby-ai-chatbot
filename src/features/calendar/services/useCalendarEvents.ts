import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  listMatters,
  listMatterTasks,
  listMatterTimeEntries,
  listMatterMilestones,
  type BackendMatter,
  type BackendMatterMilestone
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
const ENGAGEMENT_EXPIRY_DAYS = 30;

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

const coerceString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Backend matter rows use `.passthrough()` so the wire schema only types fields
 * the frontend currently consumes. `court_date` is one such pass-through field
 * the practice backend has on the underlying row but the worker doesn't surface
 * in the typed shape. We read it defensively — when the backend ships it we get
 * court events for free; when it doesn't, we get zero (no breakage).
 */
const readMatterCourtDate = (matter: BackendMatter): string | null => {
  const raw = (matter as Record<string, unknown>).court_date;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
};

/**
 * Milestones come back from the backend with `description` as the human label
 * (no dedicated `title` field). We also handle a `title` passthrough just in
 * case a backend variant exposes it.
 */
const readMilestoneTitle = (milestone: BackendMatterMilestone): string => {
  const passthroughTitle = coerceString((milestone as Record<string, unknown>).title);
  if (passthroughTitle) return passthroughTitle;
  const description = coerceString(milestone.description);
  if (description) return description;
  return 'Milestone';
};

const addDaysIso = (iso: string, days: number): string | null => {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base.getTime());
  next.setDate(next.getDate() + days);
  return next.toISOString();
};

/**
 * Aggregates calendar events from the six source systems.
 *
 * Matter-scoped sources (tasks, time entries, milestones, court dates) fan
 * out across the practice's matters and tolerate per-matter failures. Each
 * fan-out is one request per matter, so we stay aligned with the existing
 * N+1 cost shape (see `useTasks` for the same constraint). Practice-scoped
 * sources (engagements, invoices) are a single request each.
 *
 * Engagement events are emitted as three subtypes:
 *   - 'sent'     — anchored at engagement.sent_at
 *   - 'accepted' — anchored at engagement.accepted_at
 *   - 'expiry'   — sent_at + 30 days, only when status === 'sent' and not yet
 *                  accepted/declined. Mirrors the expires copy on
 *                  ClientEngagementReviewPage.
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

        // 2. Fan out tasks, time entries, milestones per matter, and fetch
        //    engagements + invoices once at the practice level — in parallel.
        const [
          tasksResults,
          timeResults,
          milestonesResults,
          engagementsResult,
          invoicesResult
        ] = await Promise.all([
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
          Promise.allSettled(
            allMatters.map((matter) =>
              listMatterMilestones(practiceId, matter.id, { signal })
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

        // — Court dates: one event per matter that exposes a court_date.
        //   Reads pass-through field defensively (see readMatterCourtDate
        //   docstring for the wire-shape rationale).
        for (const matter of allMatters) {
          const courtDate = readMatterCourtDate(matter);
          if (!isMeaningfulDate(courtDate)) continue;
          const matterTitle = titleByMatterId.get(matter.id) ?? null;
          const courthouse = coerceString(matter.court);
          const judge = coerceString(matter.judge);
          merged.push({
            id: `court:${matter.id}`,
            kind: 'court',
            title: `${matterTitle ?? 'Matter'} court date`,
            date: courtDate,
            matterId: matter.id,
            matterTitle,
            priority: 'urgent',
            court: courthouse,
            judge,
            sourceUrl: `/practice/__slug__/matters/${encodeURIComponent(matter.id)}`
          });
        }

        // — Milestones: one event per matter milestone with a due_date.
        milestonesResults.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const matter = allMatters[index];
          if (!matter) return;
          const matterTitle = titleByMatterId.get(matter.id) ?? null;
          for (const milestone of result.value) {
            if (!isMeaningfulDate(milestone.due_date)) continue;
            merged.push({
              id: `milestone:${milestone.id}`,
              kind: 'milestone',
              title: readMilestoneTitle(milestone),
              date: milestone.due_date,
              matterId: matter.id,
              matterTitle,
              status: coerceStatus(milestone.status),
              sourceUrl: `/practice/__slug__/matters/${encodeURIComponent(matter.id)}`
            });
          }
        });

        // — Engagement contracts: emit sent / accepted / expiry events.
        //   Expiry = sent_at + 30 days, only while status === 'sent' (not yet
        //   accepted or declined) so we don't surface expiry dates for
        //   already-signed contracts. Mirrors ClientEngagementReviewPage.
        if (engagementsResult && 'items' in engagementsResult) {
          for (const engagement of engagementsResult.items) {
            const matterTitle = engagement.matter_id
              ? titleByMatterId.get(engagement.matter_id) ?? engagement.title ?? null
              : engagement.title ?? null;
            const clientName = engagement.client_name ?? null;
            if (isMeaningfulDate(engagement.sent_at)) {
              merged.push({
                id: `engagement:${engagement.id}:sent`,
                kind: 'engagement',
                subtype: 'sent',
                title: `Engagement sent · ${clientName ?? 'client'}`,
                date: engagement.sent_at,
                matterId: engagement.matter_id ?? null,
                matterTitle,
                clientName,
                status: 'sent'
              });
            }
            if (isMeaningfulDate(engagement.accepted_at)) {
              merged.push({
                id: `engagement:${engagement.id}:accepted`,
                kind: 'engagement',
                subtype: 'accepted',
                title: `Engagement accepted · ${clientName ?? 'client'}`,
                date: engagement.accepted_at,
                matterId: engagement.matter_id ?? null,
                matterTitle,
                clientName,
                status: 'accepted'
              });
            }
            // Expiry: only for sent (not yet accepted / declined).
            if (
              engagement.status === 'sent'
              && isMeaningfulDate(engagement.sent_at)
            ) {
              const expiryIso = addDaysIso(engagement.sent_at, ENGAGEMENT_EXPIRY_DAYS);
              if (expiryIso) {
                merged.push({
                  id: `engagement:${engagement.id}:expiry`,
                  kind: 'engagement',
                  subtype: 'expiry',
                  title: `Engagement expires · ${clientName ?? 'client'}`,
                  date: expiryIso,
                  matterId: engagement.matter_id ?? null,
                  matterTitle,
                  clientName,
                  status: 'expiring',
                  priority: 'high'
                });
              }
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
