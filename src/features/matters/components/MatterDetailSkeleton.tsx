import { SkeletonLoader } from '@/shared/ui/layout';

/**
 * Skeleton matching `PracticeMattersPage` detail view: gradient header
 * (avatar + matter title + description) → inline meta strip (client /
 * assignees / status) → 3 banner cards (billable / rates / weekly invoices)
 * → detail field grid → recent activity. Mirrors the actual layout's
 * container classes so the swap to real content reflows minimally.
 */
const MetaCellSkeleton = ({ labelW = 'w-16', valueW = 'w-28' }: { labelW?: string; valueW?: string }) => (
  <div className="flex flex-col gap-1.5">
    <SkeletonLoader variant="text" height="h-2.5" width={labelW} rounded="rounded" />
    <SkeletonLoader variant="text" height="h-3.5" width={valueW} rounded="rounded-md" />
  </div>
);

const BannerCardSkeleton = () => (
  <div className="glass-panel flex flex-col gap-3 rounded-2xl p-5">
    <SkeletonLoader variant="text" height="h-3" width="w-24" rounded="rounded" />
    <SkeletonLoader variant="text" height="h-7" width="w-28" rounded="rounded-md" />
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
    {/* Gradient header card (avatar + title + description) */}
    <section className="glass-card mx-4 mt-4 overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="flex items-start gap-5">
        <div className="skeleton-bar h-20 w-20 rounded-full" />
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <SkeletonLoader variant="title" height="h-8" width="w-2/3" rounded="rounded-md" />
          <SkeletonLoader variant="text" height="h-3.5" width="w-1/2" rounded="rounded" />
        </div>
      </div>

      {/* Inline meta cells: CLIENT / ASSIGNEES / STATUS */}
      <div className="mt-8 grid grid-cols-3 gap-6 max-w-2xl">
        <MetaCellSkeleton labelW="w-12" valueW="w-32" />
        <MetaCellSkeleton labelW="w-20" valueW="w-24" />
        <MetaCellSkeleton labelW="w-12" valueW="w-28" />
      </div>
    </section>

    {/* Three banner stat cards + an action button on the right */}
    <section className="mx-4 mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      <BannerCardSkeleton />
      <BannerCardSkeleton />
      <div className="glass-panel flex flex-col gap-3 rounded-2xl p-5">
        <SkeletonLoader variant="text" height="h-3" width="w-32" rounded="rounded" />
        <SkeletonLoader variant="text" height="h-7" width="w-28" rounded="rounded-md" />
        <div className="mt-2">
          <SkeletonLoader variant="button" width="w-28" height="h-9" />
        </div>
      </div>
    </section>

    {/* Detail field grid (Court / Matter type / Judge / Urgency / etc.) */}
    <section className="glass-card mx-4 mt-4 rounded-2xl p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-2">
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
    <section className="glass-card mx-4 mt-4 mb-4 rounded-2xl p-6 sm:p-8">
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
