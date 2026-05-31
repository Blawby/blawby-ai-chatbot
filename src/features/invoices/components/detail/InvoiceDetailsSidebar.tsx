import { useCallback } from 'preact/hooks';
import { Copy } from 'lucide-preact';
import { Panel } from '@/shared/ui/layout/Panel';
import { Button } from '@/shared/ui/Button';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoiceDetail } from '@/features/invoices/types';

interface InvoiceDetailsSidebarProps {
  detail: InvoiceDetail;
}

const dateOrDash = (value: string | null): string => (value ? formatLongDate(value) : '—');

type CopyableFieldProps = {
  label: string;
  value: string | null;
  monospace?: boolean;
};

const CopyableField = ({ label, value, monospace }: CopyableFieldProps) => {
  const { showSuccess, showError } = useToastContext();

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(`${label} copied`, value);
    } catch (err) {
      showError(`Could not copy ${label.toLowerCase()}`, err instanceof Error ? err.message : 'Unknown error');
    }
  }, [label, value, showError, showSuccess]);

  if (!value) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-dim-2">{label}</span>
        <span className="text-dim-2">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-dim-2">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={monospace ? 'truncate font-mono text-xs text-ink' : 'truncate text-ink'}>
          {value}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          icon={Copy}
          iconClassName="h-3.5 w-3.5"
        />
      </div>
    </div>
  );
};

export const InvoiceDetailsSidebar = ({ detail }: InvoiceDetailsSidebarProps) => {
  const hasStripeData = Boolean(
    detail.stripeInvoiceId
      || detail.stripeChargeId
      || detail.stripePaymentIntentId
      || detail.stripeHostedInvoiceUrl
  );

  return (
    <aside className="flex flex-col gap-4">
      <Panel className="rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Details</h3>
        <div className="space-y-2">
          <CopyableField label="Invoice ID" value={detail.id} monospace />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-dim-2">Created</span>
            <span className="text-ink">{dateOrDash(detail.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-dim-2">Issued</span>
            <span className="text-ink">{dateOrDash(detail.issueDate)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-dim-2">Due</span>
            <span className="text-ink">{dateOrDash(detail.dueDate)}</span>
          </div>
          {detail.paidAt ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-dim-2">Paid</span>
              <span className="text-ink">{formatLongDate(detail.paidAt)}</span>
            </div>
          ) : null}
          <CopyableField label="Connected account" value={detail.connectedAccountId ?? null} monospace />
        </div>
      </Panel>

      {hasStripeData ? (
        <Panel className="rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Stripe</h3>
          <div className="space-y-2">
            {detail.stripeInvoiceId ? (
              <CopyableField label="Invoice ID" value={detail.stripeInvoiceId} monospace />
            ) : null}
            {detail.stripeInvoiceNumber ? (
              <CopyableField label="Invoice number" value={detail.stripeInvoiceNumber} monospace />
            ) : null}
            {detail.stripeChargeId ? (
              <CopyableField label="Charge ID" value={detail.stripeChargeId} monospace />
            ) : null}
            {detail.stripePaymentIntentId ? (
              <CopyableField label="Payment intent" value={detail.stripePaymentIntentId} monospace />
            ) : null}
            {detail.stripeHostedInvoiceUrl ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-dim-2">Hosted URL</span>
                <a
                  href={detail.stripeHostedInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-accent underline decoration-current/40 underline-offset-2"
                >
                  Open
                </a>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <Panel className="rounded-2xl p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Metadata</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-dim-2">Memo</p>
            <p className="mt-1 whitespace-pre-line text-ink">
              {detail.memo?.trim() || <span className="text-dim-2">No memo</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-dim-2">Notes to client</p>
            <p className="mt-1 whitespace-pre-line text-ink">
              {detail.notes?.trim() || <span className="text-dim-2">No notes</span>}
            </p>
          </div>
        </div>
      </Panel>
    </aside>
  );
};
