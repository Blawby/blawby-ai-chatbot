import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  listInvoices,
} from '@/features/invoices/services/invoicesService';
import { InvoiceFilters, type InvoiceFilterValue } from '@/features/invoices/components/InvoiceFilters';
import { InvoicesTable } from '@/features/invoices/components/InvoicesTable';
import { InvoicePagination } from '@/features/invoices/components/InvoicePagination';
import type { InvoiceListResult } from '@/features/invoices/types';

const DEFAULT_FILTERS: InvoiceFilterValue = {
  status: '',
  dateFrom: '',
  dateTo: '',
  search: '',
};

const PAGE_SIZE = 10;

export function PracticeInvoicesPage({
  practiceId,
  practiceSlug,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
}) {
  const { navigate } = useNavigation();
  const { showError } = useToastContext();
  const showErrorRef = useRef(showError);
  const [filters, setFilters] = useState<InvoiceFilterValue>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InvoiceListResult>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryFilters = useMemo(() => ({ ...filters, page, pageSize: PAGE_SIZE }), [filters, page]);

  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);

  useEffect(() => {
    if (!practiceId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void listInvoices(practiceId, queryFilters, { signal: controller.signal })
      .then((result) => {
        setData(result);
      })
      .catch((err) => {
        const status = err && typeof err === 'object' ? (err as { status?: number }).status : undefined;
        let message = err instanceof Error ? err.message : 'Failed to load invoices';
        if (status === 403) {
          message = 'Invoices unavailable for this workspace';
        } else if (status === 404) {
          message = 'Invoices route mismatch (404).';
          showErrorRef.current('Invoices', message);
        }
        setError(message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [practiceId, queryFilters]);

  const handleFilterChange = useCallback((next: InvoiceFilterValue) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const handleRowClick = useCallback((invoiceId: string) => {
    if (!practiceSlug) {
      showError('Invoices', 'Practice slug is missing from route context.');
      return;
    }
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(invoiceId)}`);
  }, [navigate, practiceSlug, showError]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-input-text">Invoices</h1>
        <p className="mt-1 text-sm text-input-placeholder">Practice-wide invoices across matters and clients.</p>
      </div>

      <InvoiceFilters value={filters} onChange={handleFilterChange} onReset={handleReset} />

      <InvoicesTable
        invoices={data.items}
        loading={loading}
        error={error}
        emptyMessage={filters.status || filters.search || filters.dateFrom || filters.dateTo ? 'No invoices match these filters.' : 'No invoices yet.'}
        onRowClick={(invoice) => handleRowClick(invoice.id)}
      />

      <InvoicePagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        onChangePage={setPage}
      />
    </div>
  );
}
