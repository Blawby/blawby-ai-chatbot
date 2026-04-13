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
 const safePageSize = pageSize > 0 ? pageSize : 10;
 const totalPages = Math.max(1, Math.ceil(total / safePageSize));
 const currentPage = Math.min(Math.max(1, page), totalPages);

 return (
  <div className="mt-4 flex items-center justify-between text-sm text-input-placeholder">
   <span>
    Page {currentPage} of {totalPages} ({total} invoices)
   </span>
   <div className="flex items-center gap-2">
    <Button
     variant="secondary"
     size="sm"
     disabled={currentPage <= 1}
     onClick={() => onChangePage(currentPage - 1)}
    >
     Previous
    </Button>
    <Button
     variant="secondary"
     size="sm"
     disabled={currentPage >= totalPages}
     onClick={() => onChangePage(currentPage + 1)}
    >
     Next
    </Button>
   </div>
  </div>
 );
};
