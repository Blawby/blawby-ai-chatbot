import { useEffect, useRef, useState } from 'preact/hooks';
import { apiClient, isAbortError, isHttpError } from '@/shared/lib/apiClient';
import { listMatters } from '@/features/matters/services/mattersApi';
import { clientIntakes } from '@/config/urls';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';

/**
 * Aggregations the Reports landing hub computes from already-shipped
 * endpoints — intake conversion, time-to-close, per-practice-area
 * breakdowns. Kept here (rather than in a new worker route) because all
 * source data is already exposed to the frontend via existing proxies.
 *
 * TODO(backend): a `/api/reports/:practiceId/hub` aggregation route would
 * cut the request count from N+2 to 1; today the hub does 4–5 in
 * parallel which is fine for solo-firm data sizes.
 */
export interface HubAggregations {
  /** Intake list (capped at 100 most recent for the period). */
  intakes: IntakeListItem[];
  /** Open + closed matters used for time-to-close. */
  matters: BackendMatter[];
  /** Average days between open_date and close_date for closed matters. */
  avgTimeToCloseDays: number | null;
  /** Median days between open_date and close_date for closed matters. */
  medianTimeToCloseDays: number | null;
  /** Number of closed matters used in the time-to-close compute. */
  closedMatterCount: number;
  /** Intake → matter conversion as a percentage (0–100), or null when no intakes. */
  conversionPercent: number | null;
  acceptedIntakeCount: number;
  totalIntakeCount: number;
  loading: boolean;
  error: string | null;
}

const INTAKE_LIST_LIMIT = 100;
const MATTER_LIST_LIMIT = 100;

const parseDate = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const computeTimeToClose = (matters: readonly BackendMatter[]) => {
  const days: number[] = [];
  for (const m of matters) {
    if (m.status !== 'closed') continue;
    const open = parseDate(m.open_date);
    const close = parseDate(m.close_date);
    if (open == null || close == null || close < open) continue;
    days.push((close - open) / 86_400_000);
  }
  if (days.length === 0) {
    return { avg: null, median: null, count: 0 };
  }
  const sorted = [...days].sort((a, b) => a - b);
  const avg = days.reduce((sum, d) => sum + d, 0) / days.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { avg, median, count: days.length };
};

const computeConversion = (intakes: readonly IntakeListItem[]) => {
  if (intakes.length === 0) {
    return { acceptedCount: 0, totalCount: 0, percent: null };
  }
  const accepted = intakes.filter((i) => i.triage_status === 'accepted').length;
  return {
    acceptedCount: accepted,
    totalCount: intakes.length,
    percent: Math.round((accepted / intakes.length) * 100),
  };
};

interface IntakeEnvelope {
  intakes: unknown;
}

const extractIntakes = (raw: unknown): IntakeListItem[] => {
  const env = raw && typeof raw === 'object' ? raw as { success?: boolean; data?: IntakeEnvelope } : null;
  const data = env?.data ?? (raw as IntakeEnvelope | null);
  const list = data && typeof data === 'object' ? (data as IntakeEnvelope).intakes : null;
  return Array.isArray(list) ? list as IntakeListItem[] : [];
};

export const useReportsHubAggregations = (
  practiceId: string,
  options: { enabled?: boolean } = {}
): HubAggregations => {
  const enabled = options.enabled !== false && Boolean(practiceId);
  const [state, setState] = useState<HubAggregations>(() => ({
    intakes: [],
    matters: [],
    avgTimeToCloseDays: null,
    medianTimeToCloseDays: null,
    closedMatterCount: 0,
    conversionPercent: null,
    acceptedIntakeCount: 0,
    totalIntakeCount: 0,
    loading: enabled,
    error: null,
  }));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return undefined;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const intakeUrl = clientIntakes(practiceId, { page: '1', limit: String(INTAKE_LIST_LIMIT) });
    const intakesPromise = apiClient
      .get<unknown>(intakeUrl, { signal: controller.signal })
      .then((res) => extractIntakes(res.data))
      .catch((err: unknown) => {
        if (isAbortError(err)) throw err;
        // Soft-fail intakes — hub still renders with revenue/matter data
        return [] as IntakeListItem[];
      });
    const mattersPromise = listMatters(practiceId, {
      signal: controller.signal,
      page: 1,
      limit: MATTER_LIST_LIMIT,
    }).catch((err: unknown) => {
      if (isAbortError(err)) throw err;
      return [] as BackendMatter[];
    });

    Promise.all([intakesPromise, mattersPromise])
      .then(([intakes, matters]) => {
        if (controller.signal.aborted) return;
        const ttc = computeTimeToClose(matters);
        const conv = computeConversion(intakes);
        setState({
          intakes,
          matters,
          avgTimeToCloseDays: ttc.avg,
          medianTimeToCloseDays: ttc.median,
          closedMatterCount: ttc.count,
          conversionPercent: conv.percent,
          acceptedIntakeCount: conv.acceptedCount,
          totalIntakeCount: conv.totalCount,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        const message = isHttpError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load aggregations';
        setState((prev) => ({ ...prev, loading: false, error: message }));
      });

    return () => controller.abort();
  }, [practiceId, enabled]);

  return state;
};
