import { StatusBadge } from '@/shared/ui/badges/StatusBadge';
import type { InvoiceStatus } from '@/features/invoices/types';

const statusMap: Record<string, any> = {
  draft: 'inactive',
  pending: 'inactive',
  sent: 'warning',
  open: 'warning',
  overdue: 'error',
  paid: 'success',
  void: 'inactive',
  cancelled: 'inactive',
};

export const InvoiceStatusBadge = ({ status }: { status: InvoiceStatus }) => {
  const normalized = status.toLowerCase();
  const variant = statusMap[normalized] ?? 'info';
  
  return (
    <StatusBadge status={variant}>
      {normalized.replace(/_/g, ' ')}
    </StatusBadge>
  );
};
