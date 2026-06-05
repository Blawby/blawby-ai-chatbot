import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { apiClient } from '@/shared/lib/apiClient';

/**
 * Subset of the worker `ActivityEvent` shape (camelCase wire) that the
 * Trust audit pane consumes. We declare it inline because the wire schema
 * under `worker/types/wire/activity.ts` still uses snake_case and is
 * tracked separately — see PR #662 for the schema reconcile work.
 */
export interface TrustAuditEvent {
  id: string;
  uid?: string;
  type: 'matter_event' | 'conversation_event';
  eventType: string;
  title: string;
  description: string;
  eventDate: string;
  actorType?: 'user' | 'lawyer' | 'system' | null;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Event types we surface in the Trust audit pane. Names mirror those the
 * worker actually emits today plus the trust-specific ones from the
 * design handoff. The filter is intentionally permissive — if the
 * backend renames an event we'd rather show it than silently hide it,
 * so this list is a best-effort allowlist that callers can extend.
 */
export const TRUST_EVENT_TYPES = [
  'trust_deposit',
  'trust_withdrawal',
  'trust_replenishment',
  'iolta_replenish',
  'iolta_audit',
  'payment_processed',
  'payment_completed',
  'payment_failed',
  'invoice_paid',
  'refund_issued',
] as const;

export interface UseTrustAuditTrailOptions {
  /** Lookback window in days. Defaults to 7. */
  days?: number;
  /** Max entries to keep. Defaults to 25 (the worker hard-caps at 50). */
  limit?: number;
  enabled?: boolean;
}

export interface UseTrustAuditTrailResult {
  events: TrustAuditEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface ActivityListEnvelope {
  success?: boolean;
  data?: {
    items?: TrustAuditEvent[];
    hasMore?: boolean;
    nextCursor?: string;
  };
}

/**
 * Org-wide audit feed scoped to trust-related event types.
 *
 * Backed by `GET /api/activity?practiceId=...&since=...&type=...` (worker
 * `queryActivity`). The endpoint already supports a comma-separated
 * `type` filter so the trust pane never has to hand-filter on the
 * client — the worker enforces auth (`requirePracticeMember`, paralegal+).
 */
export const useTrustAuditTrail = (
  practiceId: string,
  options: UseTrustAuditTrailOptions = {},
): UseTrustAuditTrailResult => {
  const { days = 7, limit = 25, enabled = true } = options;

  const [events, setEvents] = useState<TrustAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Compute `since` once per `days` change. We don't recompute on every
  // render or we'd refetch in a loop.
  const sinceIso = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return since.toISOString();
  }, [days]);

  const fetchEvents = useCallback(async (signal: AbortSignal): Promise<void> => {
    if (!practiceId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        practiceId,
        since: sinceIso,
        limit: String(limit),
        type: TRUST_EVENT_TYPES.join(','),
      });
      const response = await apiClient.get<ActivityListEnvelope>(
        `/api/activity?${params.toString()}`,
        { signal },
      );
      const items = response.data?.data?.items ?? [];
      setEvents(items);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load audit trail');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [practiceId, enabled, sinceIso, limit]);

  const refetch = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void fetchEvents(controller.signal);
  }, [fetchEvents]);

  useEffect(() => {
    if (!practiceId || !enabled) {
      setEvents([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    void fetchEvents(controller.signal);
    return () => controller.abort();
  }, [practiceId, enabled, fetchEvents]);

  return { events, loading, error, refetch };
};
