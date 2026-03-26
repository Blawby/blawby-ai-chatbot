import { useEffect, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/layout/Panel';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { Invoice } from '@/features/matters/types/billing.types';

type InvoicesSectionProps = {
  invoices: Invoice[];
  loading?: boolean;
  error?: string | null;
  onCreateInvoice: () => void;
  onSendInvoice: (invoice: Invoice) => Promise<void> | void;
  onViewInvoice: (invoice: Invoice) => void;
  onResendInvoice: (invoice: Invoice) => Promise<void> | void;
  onVoidInvoice: (invoice: Invoice) => Promise<void> | void;
  onEditDraft?: (invoice: Invoice) => void;
  onSyncInvoice?: (invoice: Invoice) => Promise<void> | void;
};

const statusClass: Record<Invoice['status'], string> = {
  draft: 'bg-white/[0.06] text-input-text border border-white/10',
  pending: 'bg-white/[0.06] text-input-text border border-white/10',
  sent: 'status-warning',
  paid: 'status-success',
  overdue: 'status-error',
  cancelled: 'bg-white/[0.04] text-input-placeholder border border-white/10'
};

export const InvoicesSection = ({
  invoices,
  loading = false,
  error = null,
  onCreateInvoice,
  onSendInvoice,
  onViewInvoice,
  onResendInvoice,
  onVoidInvoice,
  onEditDraft,
  onSyncInvoice
}: InvoicesSectionProps) => {
  const [syncDelayElapsed, setSyncDelayElapsed] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => setSyncDelayElapsed(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  const handleAction = async (id: string, action: (invoice: Invoice) => Promise<void> | void, invoice: Invoice) => {
    if (pendingIds.has(id)) return;
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await action(invoice);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handlePrimaryAction = (invoice: Invoice) => {
    if (invoice.status === 'draft' && onEditDraft) {
      onEditDraft(invoice);
      return;
    }
    onViewInvoice(invoice);
  };

  return (
    <Panel>
      <header className="flex items-center justify-between border-b border-line-glass/30 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-input-text">Invoices</h3>
          <p className="text-xs text-input-placeholder">{invoices.length} total</p>
        </div>
        <Button size="sm" onClick={onCreateInvoice}>Create invoice</Button>
      </header>

      {error ? (
        <div className="px-6 py-5 text-sm text-red-400">{error}</div>
      ) : loading ? (
        <div className="px-6 py-5 text-sm text-input-placeholder">Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div className="px-6 py-5 text-sm text-input-placeholder">No invoices yet for this matter.</div>
      ) : (
        <ul className="divide-y divide-line-default">
          {invoices.map((invoice) => {
            const isPending = pendingIds.has(invoice.id);
            return (
              <li key={invoice.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-input-text">
                    {invoice.stripe_invoice_number || invoice.invoice_number || 'Draft'}
                  </p>
                  <p className="mt-1 text-xs text-input-placeholder">
                    {invoice.issue_date ? `Issued ${formatLongDate(invoice.issue_date)}` : 'Not issued'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass[invoice.status]}`}>
                    {invoice.status.replace('_', ' ')}
                  </span>
                  {invoice.status === 'sent' && !invoice.stripe_invoice_number ? (
                    <div className="flex items-center gap-2 text-xs text-input-placeholder">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" aria-hidden="true" />
                      <span>(Syncing with Stripe...)</span>
                      {syncDelayElapsed && onSyncInvoice ? (
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => void handleAction(invoice.id, onSyncInvoice, invoice)}
                          disabled={isPending}
                        >
                          {isPending ? '...' : 'Sync now'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-sm font-semibold text-input-text">{formatCurrency(invoice.total)}</p>
                  <Button size="xs" variant="secondary" onClick={() => handlePrimaryAction(invoice)} disabled={isPending}>
                    {invoice.status === 'draft' ? 'Edit' : 'View'}
                  </Button>
                  {invoice.status === 'draft' ? (
                    <Button size="xs" onClick={() => void handleAction(invoice.id, onSendInvoice, invoice)} disabled={isPending}>
                      {isPending ? 'Sending...' : 'Send'}
                    </Button>
                  ) : null}
                  {invoice.status === 'sent' ? (
                    <Button size="xs" variant="secondary" onClick={() => void handleAction(invoice.id, onResendInvoice, invoice)} disabled={isPending}>
                      {isPending ? 'Sending...' : 'Resend'}
                    </Button>
                  ) : null}
                  {(invoice.status === 'draft' || invoice.status === 'sent' || invoice.status === 'pending') ? (
                    <Button size="xs" variant="danger-ghost" onClick={() => void handleAction(invoice.id, onVoidInvoice, invoice)} disabled={isPending}>
                      {isPending ? 'Voiding...' : 'Void'}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};
