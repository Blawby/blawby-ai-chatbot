import { StatusBadge, type StatusVariant } from '@/shared/ui/badges/StatusBadge';
import type { InvoiceStatus } from '@/features/invoices/types';

const statusMap: Record<string, StatusVariant> = {
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
 const variant = statusMap[normalized];

 if (!variant) {
  throw new Error(`Unknown invoice status: "${status}". Normalized: "${normalized}". Check statusMap in InvoiceStatusBadge.tsx.`);
 }
 
 return (
  <StatusBadge status={variant}>
   {normalized.replace(/_/g, ' ')}
  </StatusBadge>
 );
};
