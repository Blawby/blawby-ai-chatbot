import { SkeletonLoader } from '@/shared/ui/layout';

/**
 * Skeleton matching `EngagementDetailPage` body: status chip + 4 SectionCard
 * placeholders (Scope / Fees / Conflict / Goals). The page-level
 * `DetailHeader` already renders during loading; this is just the body that
 * was previously a centered `LoadingBlock h-64`.
 */
const SectionCardSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <section className="glass-card p-6 sm:p-8 space-y-4">
    <header className="flex items-center gap-2">
      <SkeletonLoader variant="chip" width="w-4" />
      <SkeletonLoader variant="text" width="w-32" height="h-3" />
    </header>
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonLoader
          key={i}
          variant="text"
          height="h-3"
          width={['w-full', 'w-11/12', 'w-3/4', 'w-5/6'][i % 4]}
        />
      ))}
    </div>
  </section>
);

export const EngagementDetailSkeleton = () => (
  <div className="flex-1 min-h-0 p-6 space-y-6">
    {/* Status chip + posted-on subtitle */}
    <div className="flex flex-wrap items-center gap-3">
      <SkeletonLoader variant="chip" width="w-28" />
      <SkeletonLoader variant="text" width="w-44" height="h-3" />
    </div>

    <SectionCardSkeleton rows={3} />
    <SectionCardSkeleton rows={4} />
    <SectionCardSkeleton rows={2} />
    <SectionCardSkeleton rows={3} />
  </div>
);
