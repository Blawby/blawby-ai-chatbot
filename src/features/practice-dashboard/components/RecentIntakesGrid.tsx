import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/shared/ui/dropdown';
import { Avatar } from '@/shared/ui/profile';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatDate } from '@/shared/utils/dateTime';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';

const statusTone: Record<string, string> = {
  accepted: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  declined: 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300',
  pending_review: 'ring-line-glass/20 bg-surface-overlay/80 text-input-placeholder',
};

type RecentIntakesGridProps = {
  intakes: IntakeListItem[];
  loading?: boolean;
  error?: string | null;
  onViewAll?: () => void;
  onViewIntake?: (uuid: string) => void;
};

export const RecentIntakesGrid = ({
  intakes,
  loading = false,
  error = null,
  onViewAll,
  onViewIntake
}: RecentIntakesGridProps) => (
  <section className="w-full">
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-input-text">Recent Intakes</h2>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-semibold text-accent-400 hover:text-accent-300"
          >
            View all
          </button>
        ) : (
          <span
            aria-disabled="true"
            className="text-sm font-semibold text-accent-400 opacity-50 cursor-default"
          >
            View all
          </span>
        )}
      </div>
      {loading ? (
        <p className="mt-6 text-sm text-input-placeholder">Loading intakes...</p>
      ) : error ? (
        <div className="mt-6 rounded-lg border border-line-glass/40 bg-surface-glass px-3 py-2 text-sm text-input-text">
          {error}
        </div>
      ) : intakes.length === 0 ? (
        <p className="mt-6 text-sm text-input-placeholder">No recent intakes.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-3 xl:gap-x-8">
          {intakes.map((intake) => (
            <li
              key={intake.uuid}
              className="glass-card flex flex-col overflow-hidden"
            >
              <div className="flex items-center gap-x-4 border-b border-line-glass/20 p-6">
                <Avatar 
                  name={intake.metadata.name || 'Unknown'} 
                  size="lg" 
                  className="h-12 w-12 rounded-lg"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-input-text">{intake.metadata.name || 'Unknown'}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative block text-input-placeholder hover:text-input-text"
                      aria-label={`Intake actions for ${intake.metadata.name || 'Unknown'}`}
                    >
                      <span className="absolute -inset-2.5" />
                      <Icon icon={EllipsisHorizontalIcon} className="h-5 w-5"  />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[140px]">
                    <DropdownMenuItem onSelect={() => onViewIntake?.(intake.uuid)}>
                      View intake
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <dl className="-my-3 divide-y divide-line-glass/20 px-6 py-4 text-sm">
                <div className="flex justify-between gap-x-4 py-3">
                  <dt className="text-input-placeholder">Date Submitted</dt>
                  <dd className="text-input-text">
                    {(() => {
                      if (!intake.created_at) return '-';
                      const display = formatDate(intake.created_at, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                      if (!display) return '-';
                      return <time dateTime={intake.created_at}>{display}</time>;
                    })()}
                  </dd>
                </div>
                <div className="flex justify-between gap-x-4 py-3">
                  <dt className="text-input-placeholder">Amount</dt>
                  <dd className="flex items-start gap-x-2">
                    <div className="font-medium text-input-text">
                      {formatCurrency(intake.amount, intake.currency)}
                    </div>
                  </dd>
                </div>
                <div className="flex justify-between gap-x-4 py-3">
                  <dt className="text-input-placeholder">Status</dt>
                  <dd className="flex items-start gap-x-2">
                    <div className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusTone[intake.triage_status] || statusTone.pending_review}`}>
                      {intake.triage_status === 'pending_review' ? 'Pending' :
                       intake.triage_status === 'accepted' ? 'Accepted' :
                       intake.triage_status === 'declined' ? 'Declined' : 'Unknown'}
                    </div>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);
