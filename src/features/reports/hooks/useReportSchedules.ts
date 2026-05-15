import { useCallback, useEffect, useState } from 'preact/hooks';
import { reportsApi } from '@/features/reports/services/reportsApi';
import type { ReportSchedule, ReportFrequency } from '@/features/reports/services/reportsTypes';

interface UseReportSchedulesResult {
  schedules: ReportSchedule[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  create: (body: {
    reportType: string;
    frequency: ReportFrequency;
    dayOfWeek?: number;
    dayOfMonth?: number;
    hourUtc: number;
    recipients: string[];
    filters: Record<string, string>;
    active?: boolean;
  }) => Promise<ReportSchedule>;
  update: (id: string, patch: Partial<ReportSchedule>) => Promise<ReportSchedule>;
  remove: (id: string) => Promise<void>;
}

export const useReportSchedules = (practiceId: string): UseReportSchedulesResult => {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!practiceId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    reportsApi
      .listSchedules(practiceId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setSchedules(items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load schedules');
        setLoading(false);
      });
    return () => controller.abort();
  }, [practiceId, tick]);

  const create: UseReportSchedulesResult['create'] = useCallback(async (body) => {
    const created = await reportsApi.createSchedule(practiceId, body);
    refetch();
    return created;
  }, [practiceId, refetch]);

  const update: UseReportSchedulesResult['update'] = useCallback(async (id, patch) => {
    const updated = await reportsApi.updateSchedule(practiceId, id, patch);
    refetch();
    return updated;
  }, [practiceId, refetch]);

  const remove = useCallback(async (id: string) => {
    await reportsApi.deleteSchedule(practiceId, id);
    refetch();
  }, [practiceId, refetch]);

  return { schedules, loading, error, refetch, create, update, remove };
};
