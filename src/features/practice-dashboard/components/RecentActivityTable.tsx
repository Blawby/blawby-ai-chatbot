import { Fragment } from 'preact';
import { ArrowDownCircleIcon, ArrowPathIcon, ArrowUpCircleIcon } from '@heroicons/react/20/solid';
import { cn } from '@/shared/utils/cn';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { ActivityDay, ActivityEntry } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

type RecentActivityTableProps = {
  days: ActivityDay[];
  loading?: boolean;
  error?: string | null;
  onOpenInvoice?: (entry: ActivityEntry) => void;
};

const formatStatusLabel = (status: ActivityEntry['status']) =>
  status.charAt(0).toUpperCase() + status.slice(1);

const formatAmountLabel = (amount: number) => `${formatCurrency(amount)} USD`;

const statusIcon = (status: ActivityEntry['status']) => {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return ArrowUpCircleIcon;
  if (normalized === 'overdue') return ArrowPathIcon;
  return ArrowDownCircleIcon;
};

const statusClass = (status: ActivityEntry['status']) => {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20';
  if (normalized === 'overdue') return 'text-rose-300 bg-rose-500/10 ring-rose-500/20';
  if (normalized === 'sent' || normalized === 'pending') return 'text-input-placeholder bg-surface-glass ring-line-glass/50';
  return 'bg-surface-glass text-input-placeholder ring-line-glass/50';
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
        <div className="mx-auto max-w-7xl px-4 py-5 text-sm text-input-placeholder sm:px-6 lg:px-8">
          Loading activity...
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
                    },
                    {
                      label: 'Yesterday',
                      isoDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                      entries: []
                    }
                  ];
                  const showEmptyRows = days.length === 0;

                  return displayDays.map((day) => (
                    <Fragment key={day.label}>
                      <tr className="text-sm text-input-text">
                        <th scope="colgroup" colSpan={3} className="relative isolate py-2 font-semibold">
                          <time dateTime={day.isoDate}>{day.label}</time>
                          <div className="absolute inset-y-0 right-full -z-10 w-screen border-b border-line-glass/30 bg-surface-glass" />
                          <div className="absolute inset-y-0 left-0 -z-10 w-screen border-b border-line-glass/30 bg-surface-glass" />
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
                                const Icon = statusIcon(entry.status);
                                return <Icon aria-hidden="true" className="hidden h-6 w-5 flex-none text-input-placeholder sm:block" />;
                              })()}
                              <div className="flex-auto">
                                <div className="flex items-start gap-x-3">
                                  <div className="text-sm font-medium text-input-text">
                                    {formatAmountLabel(entry.amount)}
                                  </div>
                                  <div className={cn(statusClass(entry.status), 'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset')}>
                                    {formatStatusLabel(entry.status)}
                                  </div>
                                </div>
                                {entry.issuedAt ? (
                                  <div className="mt-1 text-xs text-input-placeholder">
                                    {new Date(entry.issuedAt).toLocaleDateString()}
                                  </div>
                                ) : null}
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
                                View transaction
                              </button>
                            </div>
                            <div className="mt-1 text-xs text-input-placeholder">
                              Invoice <span className="text-input-text">#{entry.invoiceNumber ?? entry.invoiceId.slice(0, 6)}</span>
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
