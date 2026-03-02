import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/shared/ui/dropdown';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatDate } from '@/shared/utils/dateTime';
import type { RecentClient } from '@/features/practice-dashboard/hooks/usePracticeBillingData';

const statusTone: Record<string, string> = {
  paid: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20',
  overdue: 'text-rose-300 bg-rose-500/10 ring-rose-500/20',
  sent: 'text-input-placeholder bg-surface-glass ring-line-glass/50',
  pending: 'text-input-placeholder bg-surface-glass ring-line-glass/50'
};

type RecentClientsGridProps = {
  clients: RecentClient[];
  loading?: boolean;
  error?: string | null;
  onViewAll?: () => void;
  onViewClient?: (clientId: string) => void;
};

export const RecentClientsGrid = ({
  clients,
  loading = false,
  error = null,
  onViewAll,
  onViewClient
}: RecentClientsGridProps) => (
  <section className="w-full">
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-input-text">Recent clients</h2>
        <button
          type="button"
          onClick={() => onViewAll?.()}
          className="text-sm font-semibold text-accent-400 hover:text-accent-300"
        >
          View all
        </button>
      </div>
      {loading ? (
        <p className="mt-6 text-sm text-input-placeholder">Loading clients...</p>
      ) : error ? (
        <div className="mt-6 rounded-lg border border-line-glass/40 bg-surface-glass px-3 py-2 text-sm text-input-text">
          {error}
        </div>
      ) : clients.length === 0 ? (
        <p className="mt-6 text-sm text-input-placeholder">No recent client invoices.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-3 xl:gap-x-8">
          {clients.map((client) => (
            <li key={client.id} className="overflow-hidden rounded-xl outline outline-1 outline-line-glass/40">
              <div className="flex items-center gap-x-4 border-b border-line-glass/20 bg-surface-glass p-6">
                <div className="h-12 w-12 rounded-lg bg-line-glass/20 ring-1 ring-line-glass/30" aria-hidden="true">
                  {client.avatarUrl ? (
                    <img src={client.avatarUrl} alt={client.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : null}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-input-text">{client.name}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative block text-input-placeholder hover:text-input-text"
                      aria-label={`Client actions for ${client.name}`}
                    >
                      <span className="absolute -inset-2.5" />
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[140px]">
                    <DropdownMenuItem onSelect={() => onViewClient?.(client.id)}>
                      View client
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {client.lastInvoice ? (
                <dl className="-my-3 divide-y divide-line-glass/20 px-6 py-4 text-sm">
                  <div className="flex justify-between gap-x-4 py-3">
                    <dt className="text-input-placeholder">Last invoice</dt>
                    <dd className="text-input-text">
                      {(() => {
                        if (!client.lastInvoice.date) return '-';
                        const display = formatDate(client.lastInvoice.date, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        });
                        if (!display) return '-';
                        return (
                          <time dateTime={client.lastInvoice.date}>
                            {display}
                          </time>
                        );
                      })()}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-x-4 py-3">
                    <dt className="text-input-placeholder">Amount</dt>
                    <dd className="flex items-start gap-x-2">
                      <div className="font-medium text-input-text">{formatCurrency(client.lastInvoice.amount)}</div>
                      <div className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusTone[client.lastInvoice.status?.toLowerCase() || ''] ?? 'text-input-placeholder bg-surface-glass ring-line-glass/50'}`}>
                        {client.lastInvoice.status ?? '-'}
                      </div>
                    </dd>
                  </div>
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);
