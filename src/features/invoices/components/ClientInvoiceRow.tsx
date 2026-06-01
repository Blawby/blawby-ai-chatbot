import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { cn } from '@/shared/utils/cn';

export interface ClientInvoiceRowProps {
  invoice: InvoiceSummary;
  isSelected?: boolean;
}

/**
 * Client-facing invoice row.
 *
 * Built separately from PracticeInvoiceRow per the client/practice
 * separation rule — the client surface shows:
 *   top: serif invoice number + mono amount
 *   mid: matter title (the work being billed)
 *   bot: status pill + due date / paid date
 *
 * No staff-only data leaks here (no "staged by AI" / activity counts / time
 * entry hours). The Pay/View affordance lives in the row container's click
 * handler rather than as a competing button to keep selection clean.
 */
export function ClientInvoiceRow({ invoice, isSelected = false }: ClientInvoiceRowProps) {
  const dueQualifier = computeClientDueQualifier(invoice);
  const matterLine = invoice.matterTitle ?? '—';

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1.5 border-l-[3px] px-[22px] py-[14px] text-left transition-colors duration-150',
        isSelected
          ? 'border-l-accent bg-[color-mix(in_oklab,var(--accent)_6%,var(--card))]'
          : 'border-l-transparent hover:bg-rule-soft'
      )}
    >
      {/* Top row: serif invoice # + mono amount */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1 truncate font-[family-name:var(--serif)] text-[17px] leading-tight tracking-[-0.005em] text-ink">
          {invoice.invoiceNumber || 'Invoice'}
        </div>
        <div className="shrink-0 font-mono text-[14px] tabular-nums tracking-[-0.01em] text-ink">
          {formatCurrency(invoice.total)}
        </div>
      </div>

      {/* Mid row: matter title */}
      <div className="truncate font-mono text-[11px] tracking-[0.02em] text-dim">
        {matterLine}
      </div>

      {/* Bottom row: status pill + qualifier */}
      <div className="flex items-center justify-between gap-2">
        <InvoiceStatusBadge status={invoice.status} />
        {dueQualifier ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-dim">
            {dueQualifier}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const computeClientDueQualifier = (invoice: InvoiceSummary): string => {
  const status = invoice.status.toLowerCase();

  if (status === 'paid' && invoice.paidAt) {
    return `paid · ${formatShortDate(invoice.paidAt)}`;
  }

  if (!invoice.dueDate) return '';

  const due = new Date(invoice.dueDate);
  if (Number.isNaN(due.getTime())) return '';
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (status === 'overdue' || days < 0) {
    const absDays = Math.abs(days);
    return `overdue · ${absDays}d`;
  }
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 30) return `due in ${days}d`;
  return `due ${formatShortDate(invoice.dueDate)}`;
};

const formatShortDate = (value: string | null | undefined): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
