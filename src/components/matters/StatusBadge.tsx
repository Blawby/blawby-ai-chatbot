import { MatterWorkflowStatus } from '../../hooks/useOrganizationManagement';
import { StatusBadge } from '../ui/badges/StatusBadge';

type BaseBadgeVariant = 'active' | 'pending' | 'inactive' | 'suspended' | 'cancelled' | 'completed';

const STATUS_VARIANTS: Record<MatterWorkflowStatus, { label: string; variant: BaseBadgeVariant }> = {
  lead: { label: 'Lead', variant: 'pending' },
  open: { label: 'Open', variant: 'active' },
  in_progress: { label: 'In Progress', variant: 'active' },
  completed: { label: 'Completed', variant: 'completed' },
  archived: { label: 'Archived', variant: 'inactive' }
};

interface MatterStatusBadgeProps {
  status: MatterWorkflowStatus;
  className?: string;
}

export const MatterStatusBadge = ({ status, className }: MatterStatusBadgeProps) => {
  const config = STATUS_VARIANTS[status] ?? STATUS_VARIANTS.lead;
  return (
    <StatusBadge status={config.variant} className={className}>
      {config.label}
    </StatusBadge>
  );
};
