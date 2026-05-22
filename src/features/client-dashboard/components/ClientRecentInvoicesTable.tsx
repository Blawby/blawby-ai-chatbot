import { Fragment } from 'preact';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatDate } from '@/shared/utils/dateTime';
import type { ClientInvoiceActivityDay, ClientInvoiceActivityEntry } from '@/features/client-dashboard/hooks/useClientDashboardData';

type ClientRecentInvoicesTableProps = {
  days: ClientInvoiceActivityDay[];
  loading?: boolean;
  error?: string | null;
  onOpenInvoice?: (entry: ClientInvoiceActivityEntry) => void;
};

const formatStatusLabel = (status: ClientInvoiceActivityEntry['status']) =>
  String(status).charAt(0).toUpperCase() + String(status).slice(1);

const statusIcon = (status: ClientInvoiceActivityEntry['status']) => {
  const normalized = String(status).toLowerCase();
  if (normalized === 'paid') return ArrowUpCircle;
  if (normalized === 'overdue') return RefreshCw;
  return ArrowDownCircle;
};

const statusClass = (status: ClientInvoiceActivityEntry['status']) => {
  const normalized = String(status).toLowerCase();
  if (normalized === 'paid') return 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300';
  if (normalized === 'overdue') return 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300';
  return 'bg-surface-overlay/80 text-input-placeholder ring-line-subtle';
};

export const ClientRecentInvoicesTable = ({
  days,
  loading = false,
  error = null,
  onOpenInvoice,
}: ClientRecentInvoicesTableProps) => (
  <section>
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <h2 className="mx-auto max-w-2xl text-base font-semibold text-input-text lg:mx-0 lg:max-w-none">
        Recent invoices
      </h2>
    </div>
    {loading ? (
      <div className="mt-6 border-t border-line-subtle">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
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
      <div className="mt-6 border-t border-line-subtle">
        <div className="mx-auto max-w-7xl px-4 py-5 text-sm text-input-text sm:px-6 lg:px-8">
          {error}
        </div>
      </div>
    ) : (
      <div className="mt-6 overflow-hidden border-t border-line-subtle">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            <table className="w-full text-left">
              <thead className="sr-only">
                <tr>
                  <th>Amount</th>
                  <th className="hidden sm:table-cell">Matter</th>
                  <th>More details</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const displayDays = days.length > 0 ? days : [
                    { label: 'Today', isoDate: new Date().toISOString(), entries: [] as ClientInvoiceActivityEntry[] },
                  ];
                  const showEmptyRows = days.length === 0;
                  return displayDays.map((day) => (
                    <Fragment key={day.label}>
                      <tr className="text-sm text-input-text">
                        <th scope="colgroup" colSpan={3} className="relative isolate py-2 font-semibold">
                          <time dateTime={day.isoDate}>{day.label}</time>
                          <div className="absolute inset-y-0 right-full -z-10 w-screen border-b border-line-subtle bg-surface-overlay/70" />
                          <div className="absolute inset-y-0 left-0 -z-10 w-screen border-b border-line-subtle bg-surface-overlay/70" />
                        </th>
                      </tr>
                      {day.entries.length === 0 && showEmptyRows ? (
                        <tr>
                          <td colSpan={3} className="relative py-5 text-sm text-input-placeholder">
                            No invoice activity yet.
                            <div className="absolute right-full bottom-0 h-px w-screen bg-line-glass/20" />
                            <div className="absolute bottom-0 left-0 h-px w-screen bg-line-glass/20" />
                          </td>
                        </tr>
                      ) : day.entries.map((entry) => {
                        const ActivityIcon = statusIcon(entry.status);
                        const displayDate = entry.issuedAt ? formatDate(entry.issuedAt) : '';
                        return (
                          <tr key={entry.id}>
                            <td className="relative py-5 pr-6">
                              <div className="flex gap-x-6">
                                <Icon icon={ActivityIcon} className="hidden h-6 w-5 flex-none text-input-placeholder sm:block" aria-hidden />
                                <div className="flex-auto">
                                  <div className="flex items-start gap-x-3">
                                    <div className="text-sm font-medium text-input-text">
                                      {formatCurrency(entry.amount)} USD
                                    </div>
                                    <div className={cn(statusClass(entry.status), 'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset')}>
                                      {formatStatusLabel(entry.status)}
                                    </div>
                                  </div>
                                  {displayDate ? (
                                    <div className="mt-1 text-xs text-input-placeholder">{displayDate}</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="absolute right-full bottom-0 h-px w-screen bg-line-glass/20" />
                              <div className="absolute bottom-0 left-0 h-px w-screen bg-line-glass/20" />
                            </td>
                            <td className="hidden py-5 pr-6 sm:table-cell">
                              <div className="text-sm text-input-text">{entry.matterTitle ?? 'No matter linked'}</div>
                              <div className="mt-1 text-xs text-input-placeholder">Invoice #{entry.invoiceNumber}</div>
                            </td>
                            <td className="py-5 text-right">
                              <div className="flex justify-end">
                                <Button variant="link" size="sm" onClick={() => onOpenInvoice?.(entry)}>
                                  View invoice
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
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
