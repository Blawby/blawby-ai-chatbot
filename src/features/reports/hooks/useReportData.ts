import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { isHttpError, isAbortError } from '@/shared/lib/apiClient';
import { reportsApi, type ReportQueryParams } from '@/features/reports/services/reportsApi';
import type { ReportEnvelope } from '@/features/reports/services/reportsTypes';

export type ReportErrorCode = 'BACKEND_NOT_AVAILABLE' | 'GENERIC';

export interface ReportError {
  code: ReportErrorCode;
  message: string;
}

export interface UseReportDataResult<TRow, TMeta extends Record<string, unknown>> {
  data: ReportEnvelope<TRow, TMeta> | null;
  loading: boolean;
  error: ReportError | null;
  refetch: () => void;
}

const errorCodeFromHttp = (status: number, body: unknown): ReportErrorCode => {
  if (status === 503) {
    if (body && typeof body === 'object' && (body as { errorCode?: unknown }).errorCode === 'BACKEND_NOT_AVAILABLE') {
      return 'BACKEND_NOT_AVAILABLE';
    }
  }
  return 'GENERIC';
};

export const useReportData = <TRow = unknown, TMeta extends Record<string, unknown> = Record<string, unknown>>(
  practiceId: string,
  reportType: string,
  params: ReportQueryParams = {}
): UseReportDataResult<TRow, TMeta> => {
  const [data, setData] = useState<ReportEnvelope<TRow, TMeta> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReportError | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  // Serialize params so React detects changes without referential equality games.
  const paramKey = JSON.stringify({
    period: params.period,
    start: params.start,
    end: params.end,
    hourlyRate: params.hourlyRate,
  });

  useEffect(() => {
    if (!practiceId || !reportType) return undefined;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    reportsApi
      .fetchReport<TRow, TMeta>(practiceId, reportType, { ...params, signal: controller.signal })
      .then((env) => {
        if (controller.signal.aborted) return;
        setData(env);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        if (isHttpError(err)) {
          const code = errorCodeFromHttp(err.response.status, err.response.data);
          setError({ code, message: err.message });
        } else {
          setError({ code: 'GENERIC', message: err instanceof Error ? err.message : 'Request failed' });
        }
        setLoading(false);
      });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId, reportType, paramKey, tick]);

  return { data, loading, error, refetch };
};
