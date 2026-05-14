import { StatusBadge, type StatusVariant } from '@/shared/ui/badges/StatusBadge';

const STATUS_VARIANT: Record<string, StatusVariant> = {
  pending: 'warning',
  requested: 'warning',
  approved: 'info',
  declined: 'error',
  executed: 'success',
  cancelled: 'inactive',
};

interface RefundRequestStatusBadgeProps {
  status: string;
}

export const RefundRequestStatusBadge = ({ status }: RefundRequestStatusBadgeProps) => {
  const normalized = status.toLowerCase();
  const variant = STATUS_VARIANT[normalized] ?? 'info';
  return <StatusBadge status={variant}>{normalized}</StatusBadge>;
};
