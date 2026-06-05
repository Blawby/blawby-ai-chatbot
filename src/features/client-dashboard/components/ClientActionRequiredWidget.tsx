import { Fragment } from 'preact';
import { AlertCircle, CreditCard, FileSignature } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Panel } from '@/shared/ui/layout/Panel';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { ClientActionItem } from '@/features/client-dashboard/hooks/useClientDashboardData';

const ICONS: Record<ClientActionItem['reason'], typeof CreditCard> = {
  invoice_overdue: AlertCircle,
  invoice_due: CreditCard,
  engagement_pending: FileSignature,
};

const TONES: Record<ClientActionItem['reason'], string> = {
  invoice_overdue: 'text-rose-300',
  invoice_due: 'text-amber-300',
  engagement_pending: 'text-accent/70',
};

type ClientActionRequiredWidgetProps = {
  items: ClientActionItem[];
  loading?: boolean;
  error?: string | null;
  onAction?: (item: ClientActionItem) => void;
};

export const ClientActionRequiredWidget = ({
  items,
  loading = false,
  error = null,
  onAction,
}: ClientActionRequiredWidgetProps) => (
  <Panel className="flex h-full flex-col">
    <header className="border-b border-line-subtle px-5 py-4">
      <p className="text-sm font-semibold text-ink">Action required</p>
      <p className="text-xs text-dim-2">Things waiting on you</p>
    </header>
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      ) : error ? (
        <div className="rounded-r-md border border-card-border bg-card px-3 py-2 text-sm text-ink">
          {error}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-dim-2">You&apos;re all caught up. No actions waiting on you right now.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const ItemIcon = ICONS[item.reason];
            return (
              <Fragment key={item.id}>
                <div className="rounded-r-md border border-line-subtle bg-surface px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <Icon
                        icon={ItemIcon}
                        className={`mt-0.5 h-5 w-5 flex-none ${TONES[item.reason]}`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{item.title}</p>
                        {item.subtitle ? (
                          <p className="truncate text-xs text-dim-2">{item.subtitle}</p>
                        ) : null}
                        {item.amount != null && item.amount > 0 ? (
                          <p className="mt-1 text-sm font-semibold text-ink">
                            {formatCurrency(item.amount)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Button size="xs" onClick={() => onAction?.(item)}>
                      {item.ctaLabel}
                    </Button>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  </Panel>
);
