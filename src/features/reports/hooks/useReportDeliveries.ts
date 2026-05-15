import { useCallback, useEffect, useState } from 'preact/hooks';
import { reportsApi } from '@/features/reports/services/reportsApi';
import type { ReportDelivery } from '@/features/reports/services/reportsTypes';

interface UseReportDeliveriesResult {
  items: ReportDelivery[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export const useReportDeliveries = (practiceId: string): UseReportDeliveriesResult => {
  const [items, setItems] = useState<ReportDelivery[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!practiceId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    reportsApi
      .listDeliveries(practiceId, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setCursor(result.nextCursor);
        setHasMore(Boolean(result.nextCursor));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load deliveries');
        setLoading(false);
      });
    return () => controller.abort();
  }, [practiceId, tick]);

  const loadMore = useCallback(() => {
    if (!cursor || loading) return;
    setLoading(true);
    reportsApi
      .listDeliveries(practiceId, { cursor })
      .then((result) => {
        setItems((prev) => [...prev, ...result.items]);
        setCursor(result.nextCursor);
        setHasMore(Boolean(result.nextCursor));
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load deliveries');
        setLoading(false);
      });
  }, [practiceId, cursor, loading]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { items, loading, error, hasMore, loadMore, refetch };
};

export const useReportDeliveryDetail = (practiceId: string, deliveryId: string) => {
  const [delivery, setDelivery] = useState<ReportDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!practiceId || !deliveryId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    reportsApi
      .getDelivery(practiceId, deliveryId, controller.signal)
      .then((d) => {
        if (controller.signal.aborted) return;
        setDelivery(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load delivery');
        setLoading(false);
      });
    return () => controller.abort();
  }, [practiceId, deliveryId]);

  return { delivery, loading, error };
};
