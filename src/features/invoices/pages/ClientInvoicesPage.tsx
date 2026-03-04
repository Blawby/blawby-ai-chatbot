import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { listClientInvoices } from '@/features/invoices/services/invoicesService';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import type { InvoiceListResult } from '@/features/invoices/types';

const PAGE_SIZE = 10;

export function ClientInvoicesPage({
  practiceId,
  practiceSlug,
  statusFilter = [],
  renderMode = 'full',
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  statusFilter?: string[];
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
}) {
  const { navigate } = useNavigation();
  const { showError } = useToastContext();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InvoiceListResult>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryFilters = useMemo(
    () => ({ status: '', dateFrom: '', dateTo: '', search: '', page, pageSize: PAGE_SIZE }),
    [page]
  );

  useEffect(() => {
    setPage(1);
    setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  }, [practiceId, statusFilter]);

  useEffect(() => {
    if (!practiceId) return;
    const controller = new AbortController();
    setLoading(page === 1);
    setLoadingMore(page > 1);
    setError(null);

    void listClientInvoices(practiceId, queryFilters, { signal: controller.signal, statusFilter })
      .then((result) => {
        setData((prev) => {
          if (page === 1) {
            return result;
          }
          const merged = [...prev.items, ...result.items];
          const deduped = merged.filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index);
          return { ...result, items: deduped };
        });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Failed to load invoices';
        setError(message);
      })
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });

    return () => controller.abort();
  }, [page, practiceId, queryFilters, statusFilter]);

  const hasMore = data.items.length < data.total;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) return;
      setPage((prev) => prev + 1);
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  const handleRowClick = useCallback((invoiceId: string) => {
    if (!practiceSlug) {
      showError('Invoices', 'Practice slug is missing from route context.');
      return;
    }
    navigate(`/client/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(invoiceId)}`);
  }, [navigate, practiceSlug, showError]);

  if (renderMode === 'detailOnly') {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      {renderMode === 'full' ? (
        <div>
          <h1 className="text-xl font-semibold text-input-text">Invoices</h1>
          <p className="mt-1 text-sm text-input-placeholder">Your invoices and payment history.</p>
        </div>
      ) : null}

      <InvoicesTable
        invoices={data.items}
        loading={loading}
        error={error}
        emptyMessage={statusFilter.length > 0 ? 'No invoices match these filters.' : 'No invoices yet.'}
        onRowClick={(invoice) => handleRowClick(invoice.id)}
      />
      {hasMore ? <div ref={loadMoreRef} className="h-8" /> : null}
      {loadingMore ? (
        <p className="text-sm text-input-placeholder">Loading more invoices...</p>
      ) : null}
    </div>
  );
}
