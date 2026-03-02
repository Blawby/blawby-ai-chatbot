import type { FunctionComponent } from 'preact';
import type { InvoiceStatus } from '@/features/invoices/types';

const statusClasses: Record<string, string> = {
  draft: 'bg-white/[0.06] text-input-text border border-white/10',
  pending: 'bg-white/[0.06] text-input-text border border-white/10',
  sent: 'status-warning',
  open: 'status-warning',
  overdue: 'status-error',
  paid: 'status-success',
  void: 'bg-white/[0.05] text-input-placeholder border border-white/10',
  cancelled: 'bg-white/[0.05] text-input-placeholder border border-white/10',
};

export const InvoiceStatusBadge: FunctionComponent<{ status: InvoiceStatus }> = ({ status }) => {
  const normalized = status.toLowerCase();
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium ${statusClasses[normalized] ?? statusClasses.pending}`}>
      {normalized.replace('_', ' ')}
    </span>
  );
};
