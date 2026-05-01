import { SkeletonLoader } from '@/shared/ui/layout';

/**
 * Skeleton placeholder shaped like the rendered invoice detail body:
 * status badge → 3 totals tiles → line-items table → payments/refunds row.
 *
 * Used by `PracticeInvoiceDetailPage` and `ClientInvoiceDetailPage` while
 * the first fetch is in flight (post-fetch refetches surface an inline
 * spinner next to the title instead of swapping back to this skeleton).
 */
export const InvoiceDetailSkeleton = () => (
  <div className="flex-1 p-6">
    <div className="space-y-6">
      {/* Status badge */}
      <SkeletonLoader variant="chip" />

      {/* Total / Paid / Due tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-panel p-4 space-y-2">
            <SkeletonLoader variant="text" width="w-20" height="h-3" />
            <SkeletonLoader variant="text" width="w-24" height="h-5" />
          </div>
        ))}
      </div>

      {/* Line-items table */}
      <div className="glass-panel overflow-hidden">
        <div className="border-b border-line-glass/30 px-4 py-3">
          <SkeletonLoader variant="text" width="w-24" height="h-4" />
        </div>
        <div className="divide-y divide-line-glass/20">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_0.5fr_1fr_1fr] gap-4 px-4 py-3">
              <SkeletonLoader variant="text" height="h-3" width={i % 2 === 0 ? 'w-48' : 'w-40'} />
              <SkeletonLoader variant="text" height="h-3" width="w-16" />
              <SkeletonLoader variant="text" height="h-3" width="w-8" />
              <SkeletonLoader variant="text" height="h-3" width="w-16" />
              <SkeletonLoader variant="text" height="h-3" width="w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Payments / Refunds / Notes row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-panel p-4 space-y-3">
            <SkeletonLoader variant="text" width="w-32" height="h-4" />
            <SkeletonLoader variant="text" width="w-44" height="h-3" />
            <SkeletonLoader variant="text" width="w-28" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  </div>
);
