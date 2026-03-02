import type { FunctionComponent } from 'preact';
import { Button } from '@/shared/ui/Button';

interface InvoicePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChangePage: (page: number) => void;
}

export const InvoicePagination: FunctionComponent<InvoicePaginationProps> = ({
  page,
  pageSize,
  total,
  onChangePage,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-input-placeholder">
      <span>
        Page {page} of {totalPages} ({total} invoices)
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChangePage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChangePage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
