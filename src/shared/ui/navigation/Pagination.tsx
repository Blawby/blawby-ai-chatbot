import { useMemo } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { ChevronLeft, ChevronRight } from 'lucide-preact';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  size?: 'sm' | 'md';
  className?: string;
}

function getPageRange(current: number, total: number, siblings: number): (number | 'dots')[] {
  const range: (number | 'dots')[] = [];
  const left = Math.max(2, current - siblings);
  const right = Math.min(total - 1, current + siblings);

  range.push(1);
  if (left > 2) range.push('dots');
  for (let i = left; i <= right; i++) range.push(i);
  if (right < total - 1) range.push('dots');
  if (total > 1) range.push(total);

  return range;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  size = 'md',
  className,
}: PaginationProps) {
  const pages = useMemo(
    () => getPageRange(currentPage, totalPages, siblingCount),
    [currentPage, totalPages, siblingCount],
  );

  const btnSize = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        className={cn('btn btn-ghost rounded-lg', btnSize, 'disabled:opacity-35')}
      >
        <ChevronLeft size={size === 'sm' ? 14 : 16} />
      </button>
      {pages.map((page, i) =>
        page === 'dots' ? (
          <span key={`dots-${i}`} className="px-1 text-input-placeholder text-sm">...</span>
        ) : (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={cn(
              'btn rounded-lg font-medium',
              btnSize,
              page === currentPage
                ? 'bg-accent-500/12 text-accent-600 dark:text-accent-400'
                : 'btn-ghost text-input-text',
            )}
          >
            {page}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        className={cn('btn btn-ghost rounded-lg', btnSize, 'disabled:opacity-35')}
      >
        <ChevronRight size={size === 'sm' ? 14 : 16} />
      </button>
    </nav>
  );
}
