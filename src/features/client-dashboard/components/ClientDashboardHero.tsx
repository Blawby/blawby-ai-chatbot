import { Send } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Avatar } from '@/shared/ui/profile';
import { cn } from '@/shared/utils/cn';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import type { ClientDashboardStat } from '@/features/client-dashboard/hooks/useClientDashboardData';

const toneClass: Record<NonNullable<ClientDashboardStat['tone']>, string> = {
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  attention: 'text-amber-300',
  neutral: 'text-dim-2',
};

type ClientDashboardHeroProps = {
  practiceName?: string | null;
  practiceLogo?: string | null;
  stats: ClientDashboardStat[];
  loading?: boolean;
  onSendMessage?: () => void;
};

export const ClientDashboardHero = ({
  practiceName,
  practiceLogo,
  stats,
  loading = false,
  onSendMessage,
}: ClientDashboardHeroProps) => {
  const name = typeof practiceName === 'string' ? practiceName.trim() : '';
  return (
    <section className="border-b border-line-subtle lg:border-t lg:border-t-line-subtle">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Avatar
          src={practiceLogo}
          name={name}
          size="md"
          className="ring-2 ring-line-subtle"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-dim-2">Your account</p>
          <h1 className="truncate text-base font-semibold text-ink">{name || 'Your account'}</h1>
        </div>
        <div className="ml-auto shrink-0">
          <Button
            size="sm"
            className="px-4"
            onClick={onSendMessage}
            disabled={!onSendMessage}
          >
            <Icon icon={Send} className="mr-2 h-4 w-4" aria-hidden />
            Send a message
          </Button>
        </div>
      </div>
      {loading && stats.length === 0 ? (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <SkeletonLoader variant="text" width="w-16" />
                <SkeletonLoader variant="title" width="w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <dl className="mx-auto grid max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:px-2 xl:px-0">
          {stats.map((stat, idx) => (
            <div
              key={stat.id}
              className={cn(
                idx % 2 === 1 ? 'sm:border-l sm:border-line-subtle' : idx === 2 ? 'lg:border-l lg:border-line-subtle' : '',
                'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-line-subtle px-4 py-10 sm:px-6 lg:border-t-0 xl:px-8'
              )}
            >
              <dt className="text-sm font-medium text-dim-2">{stat.label}</dt>
              {stat.helper ? (
                <dd className={cn(stat.tone ? toneClass[stat.tone] : 'text-dim-2', 'text-xs font-medium')}>
                  {stat.helper}
                </dd>
              ) : null}
              <dd className="w-full flex-none text-3xl font-medium tracking-tight text-ink">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
