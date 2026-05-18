import { Briefcase } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { ClientMatterCard } from '@/features/client-dashboard/hooks/useClientDashboardData';

type ClientMattersGridProps = {
  matters: ClientMatterCard[];
  loading?: boolean;
  error?: string | null;
  onViewAll?: () => void;
  onViewMatter?: (matterId: string) => void;
};

export const ClientMattersGrid = ({
  matters,
  loading = false,
  error = null,
  onViewAll,
  onViewMatter,
}: ClientMattersGridProps) => (
  <section className="w-full">
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-input-text">Your matters</h2>
        <Button variant="link" size="sm" onClick={() => onViewAll?.()}>
          View all
        </Button>
      </div>
      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 rounded-xl bg-surface-overlay/80 p-6 outline outline-1 outline-line-glass/40">
              <SkeletonLoader variant="text" width="w-32" />
              <SkeletonLoader variant="text" width="w-24" />
              <SkeletonLoader variant="text" width="w-20" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-input-text">
          {error}
        </div>
      ) : matters.length === 0 ? (
        <p className="mt-6 text-sm text-input-placeholder">No matters yet. When your firm opens a matter for you, it'll show up here.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-x-8">
          {matters.map((matter) => (
            <li
              key={matter.id}
              className="overflow-hidden rounded-xl bg-surface-overlay/80 outline outline-1 outline-line-glass/40 backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => onViewMatter?.(matter.id)}
                className="block w-full text-left transition-colors hover:bg-surface-utility/20"
              >
                <div className="flex items-start gap-3 border-b border-line-glass/20 bg-surface-overlay/70 p-5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-utility/30">
                    <Icon icon={Briefcase} className="h-5 w-5 text-input-placeholder" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-input-text">{matter.title}</p>
                    {matter.practiceArea ? (
                      <p className="truncate text-xs text-input-placeholder">{matter.practiceArea}</p>
                    ) : null}
                  </div>
                </div>
                <dl className="divide-y divide-line-glass/20 bg-surface-overlay/60 px-5 py-3 text-sm">
                  <div className="flex justify-between gap-x-4 py-2">
                    <dt className="text-input-placeholder">Status</dt>
                    <dd className="text-input-text">{matter.statusLabel ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-x-4 py-2">
                    <dt className="text-input-placeholder">Last update</dt>
                    <dd className="text-input-text">
                      {matter.updatedAt ? formatRelativeTime(matter.updatedAt) : '—'}
                    </dd>
                  </div>
                </dl>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);
