import type { InvoiceSummary } from '@/features/invoices/types';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { cn } from '@/shared/utils/cn';

export interface PracticeInvoiceRowProps {
  invoice: InvoiceSummary;
  isSelected?: boolean;
}

/**
 * Chat-first practice invoice row (Invoices.html `.inv-row`).
 *
 * Three-line composition:
 *   top: serif client name + mono amount
 *   mid: mono "INV-#### · matter · sub-line"
 *   bot: status pill + mono due qualifier ("due in 3d" / "overdue 18d" / "Nov 25")
 *
 * Selected state uses the `.split-detail-list-item.active` CSS already in
 * `src/index.css` — caller wraps each row in a `<button>` (EntityList does)
 * but the row composes the visual cells; selection styling is handled here
 * via the row container's class.
 */
export function PracticeInvoiceRow({ invoice, isSelected = false }: PracticeInvoiceRowProps) {
  const dueQualifier = computeDueQualifier(invoice);
  const matterLine = buildMatterLine(invoice);

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1.5 border-l-[3px] px-[22px] py-[14px] text-left transition-colors duration-150',
        isSelected
          ? 'border-l-accent bg-[color-mix(in_oklab,var(--accent)_6%,var(--card))]'
          : 'border-l-transparent hover:bg-rule-soft'
      )}
    >
      {/* Top row: serif client + mono amount */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1 truncate font-[family-name:var(--serif)] text-[17px] leading-tight tracking-[-0.005em] text-ink">
          {invoice.clientName ?? 'Unknown client'}
        </div>
        <div className="shrink-0 font-mono text-[14px] tabular-nums tracking-[-0.01em] text-ink">
          {formatCurrency(invoice.total)}
        </div>
      </div>

      {/* Mid row: mono invoice number + matter sub-line */}
      <div className="flex items-center gap-2 overflow-hidden truncate font-mono text-[11px] tracking-[0.02em] text-dim">
        {matterLine}
      </div>

      {/* Bottom row: status pill + due qualifier */}
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

const buildMatterLine = (invoice: InvoiceSummary) => {
  const segments: string[] = [];
  if (invoice.invoiceNumber) segments.push(invoice.invoiceNumber);
  if (invoice.matterTitle) segments.push(invoice.matterTitle);
  if (invoice.invoiceType) segments.push(invoice.invoiceType);
  return segments.length > 0 ? segments.join(' · ') : '—';
};

const computeDueQualifier = (invoice: InvoiceSummary): string => {
  const status = invoice.status.toLowerCase();

  if (status === 'paid' && invoice.paidAt) {
    return formatShortDate(invoice.paidAt);
  }

  if (status === 'draft') {
    const created = invoice.createdAt;
    if (!created) return 'draft';
    const rel = formatRelativeTime(created);
    return `draft · ${rel}`;
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
