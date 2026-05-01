// Removed per-Card action menu: cards are now clickable
import { Avatar } from '@/shared/ui/profile';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { fromMinorUnits } from '@/shared/utils/money';
import { formatDate } from '@/shared/utils/dateTime';
import type { IntakeListItem } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';

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
          <Button variant="link" size="sm" onClick={onViewAll}>
            View all
          </Button>
        ) : (
          <span
            aria-disabled="true"
            className="text-sm font-semibold text-input-placeholder opacity-70 cursor-default"
          >
            View all
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-3">
              <SkeletonLoader variant="avatar" className="mx-auto" />
              <SkeletonLoader variant="text" width="w-20" className="mx-auto" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-xl border border-line-glass/40 bg-surface-glass px-3 py-2 text-sm text-input-text">
          {error}
        </div>
      ) : intakes.length === 0 ? (
        <p className="mt-6 text-sm text-input-placeholder">No recent intakes.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-3 xl:gap-x-8">
          {intakes.map((intake) => {
            const contactName = intake.metadata.name || 'Unknown';
            const title = resolveIntakeTitle(intake.metadata, contactName);
            const actionable = Boolean(onViewIntake);
            return (
              <li
                key={intake.uuid}
                className="glass-card flex flex-col overflow-hidden"
              >
                <button
                  className={
                    `flex w-full items-center gap-x-4 border-b border-line-glass/20 p-6 text-left ${actionable ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-400 focus:outline-none' : ''}`
                  }
                  role={actionable ? 'button' : undefined}
                  tabIndex={actionable ? 0 : -1}
                  aria-disabled={actionable ? undefined : true}
                  type="button"
                  onClick={actionable ? () => onViewIntake?.(intake.uuid) : undefined}
                  onKeyDown={actionable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onViewIntake?.(intake.uuid);
                    }
                  } : undefined}
                >
                  <Avatar 
                    name={contactName}
                    size="lg" 
                    className="h-12 w-12 rounded-xl"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-input-text">{title}</p>
                  </div>
                  {/* actions removed — whole card is clickable */}
                </button>
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
                      {formatCurrency(fromMinorUnits(intake.amount), intake.currency)}
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
            );
          })}
        </ul>
      )}
    </div>
  </section>
);
