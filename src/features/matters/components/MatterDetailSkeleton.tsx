import { SkeletonLoader } from '@/shared/ui/layout';

/**
 * Skeleton matching `PracticeMattersPage` detail view: hero card with avatar +
 * title + description → segmented icon tab group → 3 banner KPI cards
 * (icon-square + value + helper) → "Case details" panel → recent activity.
 * Mirrors the actual layout's container classes so the swap to real content
 * reflows minimally.
 */
const MetaCellSkeleton = ({ labelW = 'w-16', valueW = 'w-28' }: { labelW?: string; valueW?: string }) => (
  <div className="flex flex-col gap-1.5">
    <SkeletonLoader variant="text" height="h-2.5" width={labelW} rounded="rounded" />
    <SkeletonLoader variant="text" height="h-3.5" width={valueW} rounded="rounded-md" />
  </div>
);

const KpiCardSkeleton = () => (
  <div className="panel flex flex-col gap-3 rounded-2xl p-5">
    <div className="flex items-center gap-2">
      <div className="skeleton-bar h-7 w-7 rounded-lg" />
      <SkeletonLoader variant="text" height="h-2.5" width="w-24" rounded="rounded" />
    </div>
    <SkeletonLoader variant="text" height="h-7" width="w-32" rounded="rounded-md" />
    <SkeletonLoader variant="text" height="h-3" width="w-44" rounded="rounded" />
  </div>
);

const DetailRowSkeleton = ({ labelW, valueW }: { labelW: string; valueW: string }) => (
  <div className="flex flex-col gap-1.5">
    <SkeletonLoader variant="text" height="h-2.5" width={labelW} rounded="rounded" />
    <SkeletonLoader variant="text" height="h-3.5" width={valueW} rounded="rounded-md" />
  </div>
);

export const MatterDetailSkeleton = () => (
  <div className="flex h-full min-h-0 flex-col overflow-y-auto" aria-hidden="true">
    {/* Hero card (avatar + title + description + segmented tab group) */}
    <section className="card mx-4 mt-4 overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="flex items-start gap-5">
        <div className="skeleton-bar h-20 w-20 rounded-full" />
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <SkeletonLoader variant="title" height="h-8" width="w-3/5" rounded="rounded-md" />
          <SkeletonLoader variant="text" height="h-3.5" width="w-1/2" rounded="rounded" />
        </div>
      </div>

      {/* Segmented tab group placeholder */}
      <div className="mt-5 inline-flex gap-1 rounded-2xl border border-line-subtle bg-surface-card-raised p-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-bar h-9 w-9 rounded-xl" />
        ))}
      </div>

      {/* Inline meta cells: CLIENT / ASSIGNED / STATUS */}
      <div className="mt-8 grid grid-cols-3 gap-6 max-w-2xl">
        <MetaCellSkeleton labelW="w-12" valueW="w-32" />
        <MetaCellSkeleton labelW="w-20" valueW="w-24" />
        <MetaCellSkeleton labelW="w-12" valueW="w-28" />
      </div>
    </section>

    {/* Three KPI cards with icon-square + Outfit-display value */}
    <section className="mx-4 mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      <KpiCardSkeleton />
      <KpiCardSkeleton />
      <KpiCardSkeleton />
    </section>

    {/* Case details panel — header + 8 read-only field rows */}
    <section className="card mx-4 mt-4 rounded-2xl">
      <div className="flex items-center justify-between border-b border-card-border px-6 py-4">
        <SkeletonLoader variant="text" height="h-3.5" width="w-24" rounded="rounded-md" />
        <div className="skeleton-bar h-px w-8 rounded" />
      </div>
      <div className="grid grid-cols-1 gap-x-12 gap-y-6 p-6 sm:p-8 sm:grid-cols-2">
        <DetailRowSkeleton labelW="w-12" valueW="w-24" />
        <DetailRowSkeleton labelW="w-20" valueW="w-20" />
        <DetailRowSkeleton labelW="w-12" valueW="w-24" />
        <DetailRowSkeleton labelW="w-16" valueW="w-28" />
        <DetailRowSkeleton labelW="w-24" valueW="w-32" />
        <DetailRowSkeleton labelW="w-32" valueW="w-24" />
        <DetailRowSkeleton labelW="w-28" valueW="w-32" />
        <DetailRowSkeleton labelW="w-36" valueW="w-28" />
      </div>
    </section>

    {/* Recent activity */}
    <section className="card mx-4 mt-4 mb-4 rounded-2xl p-6 sm:p-8">
      <SkeletonLoader variant="text" height="h-4" width="w-28" rounded="rounded-md" />
      <div className="mt-5 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="skeleton-bar h-8 w-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkeletonLoader
                variant="text"
                height="h-3"
                width={['w-3/4', 'w-2/3', 'w-4/5'][i]}
                rounded="rounded-md"
              />
              <SkeletonLoader variant="text" height="h-2.5" width="w-20" rounded="rounded" />
            </div>
          </div>
        ))}
      </div>
    </section>
  </div>
);
