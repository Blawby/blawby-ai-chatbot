import { SkeletonLoader } from '@/shared/ui/layout';

const SectionCardSkeleton = ({ rows = 3, chips = 0 }: { rows?: number; chips?: number }) => (
  <section className="glass-card p-5 sm:p-6 space-y-4">
    <header className="flex items-center gap-2">
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
    {chips > 0 && (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: chips }, (_, i) => (
          <SkeletonLoader key={i} variant="chip" width="w-20" />
        ))}
      </div>
    )}
  </section>
);

const ConversationCardCollapsedSkeleton = () => (
  <section className="glass-card p-5 sm:p-6 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <SkeletonLoader variant="text" width="w-24" height="h-3" />
      <SkeletonLoader variant="text" width="w-16" height="h-3" />
    </div>
    <SkeletonLoader variant="chip" width="w-6" />
  </section>
);

export const EngagementDetailSkeleton = () => (
  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 p-4 sm:p-6">
    {/* Left column: 3 detail cards */}
    <div className="flex flex-col gap-4">
      <SectionCardSkeleton rows={4} />
      <SectionCardSkeleton rows={2} chips={4} />
      <SectionCardSkeleton rows={4} />
    </div>

    {/* Right column: 5 narrower cards (Timeline / Risk / Source / Notes / Conversation collapsed) */}
    <aside className="flex flex-col gap-4">
      <SectionCardSkeleton rows={3} />
      <SectionCardSkeleton rows={2} chips={2} />
      <SectionCardSkeleton rows={3} />
      <SectionCardSkeleton rows={3} />
      <ConversationCardCollapsedSkeleton />
    </aside>
  </div>
);
