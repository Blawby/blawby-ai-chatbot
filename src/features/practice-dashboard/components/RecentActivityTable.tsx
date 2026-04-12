import { Fragment } from 'preact';
import { ArrowDownCircleIcon, ArrowPathIcon, ArrowUpCircleIcon } from '@heroicons/react/20/solid';
import { StatusBadge, type StatusVariant } from '@/shared/ui/badges/StatusBadge';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatDate } from '@/shared/utils/dateTime';
import type { ActivityDay, ActivityEntry } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

type RecentActivityTableProps = {
  days: ActivityDay[];
  loading?: boolean;
  error?: string | null;
  onOpenInvoice?: (entry: ActivityEntry) => void;
};

const formatStatusLabel = (status: ActivityEntry['status']) =>
  status.charAt(0).toUpperCase() + status.slice(1);

const formatAmountLabel = (amount: number) => {
  // NOTE: This UI currently assumes USD. 
  // Future multi-currency support should pass a currency code here.
  return `${formatCurrency(amount)} USD`;
};

const statusIcon = (status: ActivityEntry['status']) => {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return ArrowUpCircleIcon;
  if (normalized === 'overdue') return ArrowPathIcon;
  return ArrowDownCircleIcon;
};

const statusVariant = (status: ActivityEntry['status']): StatusVariant => {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return 'success';
  if (normalized === 'overdue') return 'error';
  if (normalized === 'sent' || normalized === 'pending') return 'pending';
  return 'inactive';
};

export const RecentActivityTable = ({ days, loading = false, error = null, onOpenInvoice }: RecentActivityTableProps) => (
  <section>
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <h2 className="mx-auto max-w-2xl text-base font-semibold text-input-text lg:mx-0 lg:max-w-none">
        Recent activity
      </h2>
    </div>
    {loading ? (
      <div className="mt-6 border-t border-line-glass/30">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center space-x-4">
                <SkeletonLoader variant="avatar" />
                <div className="flex-1 space-y-2">
                  <SkeletonLoader variant="text" width="w-32" />
                  <SkeletonLoader variant="text" width="w-48" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ) : error ? (
      <div className="mt-6 border-t border-line-glass/30">
        <div className="mx-auto max-w-7xl px-4 py-5 text-sm text-input-text sm:px-6 lg:px-8">
          {error}
        </div>
      </div>
    ) : (
      <div className="mt-6 overflow-hidden border-t border-line-glass/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            <table className="w-full text-left">
              <thead className="sr-only">
                <tr>
                  <th>Amount</th>
                  <th className="hidden sm:table-cell">Client</th>
                  <th>More details</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const displayDays = days.length > 0 ? days : [
                    {
                      label: 'Today',
                      isoDate: new Date().toISOString(),
                      entries: []
                    }
                  ];
                  const showEmptyRows = days.length === 0;

                  return displayDays.map((day) => (
                    <Fragment key={day.label}>
                      <tr className="text-sm text-input-text">
                        <th scope="colgroup" colSpan={3} className="relative isolate py-2 font-semibold">
                          <time dateTime={day.isoDate}>{day.label}</time>
                          <div className="absolute inset-y-0 right-full -z-10 w-screen border-b border-line-glass/30 bg-surface-overlay/70" />
                          <div className="absolute inset-y-0 left-0 -z-10 w-screen border-b border-line-glass/30 bg-surface-overlay/70" />
                        </th>
                      </tr>
                      {day.entries.length === 0 && showEmptyRows ? (
                        <tr>
                          <td colSpan={3} className="relative py-5 text-sm text-input-placeholder">
                            No transactions yet.
                            <div className="absolute right-full bottom-0 h-px w-screen bg-line-glass/20" />
                            <div className="absolute bottom-0 left-0 h-px w-screen bg-line-glass/20" />
                          </td>
                        </tr>
                      ) : day.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="relative py-5 pr-6">
                            <div className="flex gap-x-6">
                              {(() => {
                                const activityIcon = statusIcon(entry.status);
                                return <Icon icon={activityIcon} className="hidden h-6 w-5 flex-none text-input-placeholder sm:block" />;
                              })()}
                              <div className="flex-auto">
                                <div className="flex items-start gap-x-3">
                                  <div className="text-sm font-medium text-input-text">
                                    {formatAmountLabel(entry.amount)}
                                  </div>
                                    <StatusBadge status={statusVariant(entry.status)}>
                                      {formatStatusLabel(entry.status)}
                                    </StatusBadge>
                                </div>
                                {(() => {
                                  const displayDate = entry.issuedAt ? formatDate(entry.issuedAt) : '';
                                  if (!displayDate) return null;
                                  return (
                                    <div className="mt-1 text-xs text-input-placeholder">
                                      {displayDate}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="absolute right-full bottom-0 h-px w-screen bg-line-glass/20" />
                            <div className="absolute bottom-0 left-0 h-px w-screen bg-line-glass/20" />
                          </td>
                          <td className="hidden py-5 pr-6 sm:table-cell">
                            <div className="text-sm text-input-text">{entry.clientName}</div>
                            <div className="mt-1 text-xs text-input-placeholder">{entry.description ?? '-'}</div>
                          </td>
                          <td className="py-5 text-right">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => onOpenInvoice?.(entry)}
                                className="text-sm font-medium text-accent-400 hover:text-accent-300"
                              >
                                View invoice
                              </button>
                            </div>
                            <div className="mt-1 text-xs text-input-placeholder">
                              Invoice <span className="text-input-text">#{entry.invoiceNumber ?? entry.invoiceId?.slice(0, 6)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
  </section>
);
