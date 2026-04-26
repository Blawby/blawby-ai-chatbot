import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { BillingWindow, DashboardStat } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

const WINDOW_LABELS: Record<BillingWindow, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All-time'
};

type DashboardHeroProps = {
  windowSize: BillingWindow;
  stats: DashboardStat[];
  loading?: boolean;
  onWindowChange: (window: BillingWindow) => void;
  onCreateInvoice?: () => void;
};

export const DashboardHero = ({
  windowSize,
  stats,
  loading = false,
  onWindowChange,
  onCreateInvoice
}: DashboardHeroProps) => (
  <section className="border-b border-line-glass/30 lg:border-t lg:border-t-line-glass/20">
    <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <h1 className="shrink-0 text-base font-semibold text-input-text">Cashflow</h1>
      <div className="flex shrink-0 gap-x-8 border-l border-line-glass/30 pl-6 text-sm font-semibold">
        {(Object.keys(WINDOW_LABELS) as BillingWindow[]).map((window) => (
          <Button
            key={window}
            variant="tab"
            size="sm"
            onClick={() => onWindowChange(window)}
            aria-selected={window === windowSize}
          >
            {WINDOW_LABELS[window]}
          </Button>
        ))}
      </div>
      <div className="ml-auto shrink-0">
        <Button onClick={onCreateInvoice} size="sm" className="px-4">
          New invoice
        </Button>
      </div>
    </div>
    {loading && stats.length === 0 ? (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <SkeletonLoader variant="text" width="w-16" />
              <SkeletonLoader variant="title" width="w-24" />
            </div>
          ))}
        </div>
      </div>
    ) : (
      <dl className="mx-auto grid max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:px-2 xl:px-0">
        {stats.map((stat, statIdx) => (
          <div
            key={stat.id}
            className={cn(
              statIdx % 2 === 1 ? 'sm:border-l sm:border-line-glass/20' : statIdx === 2 ? 'lg:border-l lg:border-line-glass/20' : '',
              'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-line-glass/20 px-4 py-10 sm:px-6 lg:border-t-0 xl:px-8'
            )}
          >
            <dt className="text-sm font-medium text-input-placeholder">{stat.label}</dt>
            {stat.changeLabel ? (
              <dd className={cn(stat.changeTone === 'negative' ? 'text-rose-300' : 'text-input-placeholder', 'text-xs font-medium')}>
                {stat.changeLabel}
              </dd>
            ) : null}
            <dd className="w-full flex-none text-3xl font-medium tracking-tight text-input-text">
              {formatCurrency(stat.value)}
            </dd>
          </div>
        ))}
      </dl>
    )}
  </section>
);
