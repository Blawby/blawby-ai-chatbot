import { Panel } from '@/shared/ui/layout/Panel';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { DashboardStat } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

const toneClass: Record<NonNullable<DashboardStat['tone']>, string> = {
  positive: 'text-accent-300',
  negative: 'text-ink',
  neutral: 'text-dim-2'
};

const changeToneClass: Record<NonNullable<DashboardStat['changeTone']>, string> = {
  positive: 'text-accent-300',
  negative: 'text-ink',
  neutral: 'text-dim-2'
};

type DashboardSummaryCardsProps = {
  stats: DashboardStat[];
  loading?: boolean;
};

export const DashboardSummaryCards = ({ stats, loading = false }: DashboardSummaryCardsProps) => (
  <Panel className="overflow-hidden">
    {loading && stats.length === 0 ? (
      <div className="py-8">
        <div className="space-y-3">
          <SkeletonLoader variant="rect" height="h-16" />
          <SkeletonLoader variant="rect" height="h-16" />
          <SkeletonLoader variant="rect" height="h-16" />
        </div>
      </div>
    ) : stats.map((stat, index) => (
      <div
        key={stat.id}
        className={[
          'px-5 py-6 sm:px-6',
          index > 0 ? 'border-t border-line-subtle' : '',
          index % 2 === 1 ? 'sm:border-l sm:border-line-subtle' : '',
          index > 1 ? 'sm:border-t sm:border-line-subtle' : '',
          'grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'
        ].join(' ')}
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-dim-2">{stat.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            {formatCurrency(stat.value)}
          </p>
          {stat.helper ? (
            <p className={`mt-1 text-xs ${stat.tone ? toneClass[stat.tone] : 'text-dim-2'}`}>
              {stat.helper}
            </p>
          ) : null}
        </div>
        <div className="flex items-start justify-end">
          {stat.changeLabel ? (
            <span className={`mt-1 rounded-md bg-paper-2/10 px-2 py-1 text-xs font-semibold ${changeToneClass[stat.changeTone ?? 'neutral']}`}>
              {stat.changeLabel}
            </span>
          ) : null}
        </div>
      </div>
    ))}
  </Panel>
);
