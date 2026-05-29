import { Pill, type PillTone } from '@/design-system/primitives';

export type MatterWorkflowStatus = 'lead' | 'open' | 'in_progress' | 'completed' | 'archived';

const STATUS_VARIANTS: Record<MatterWorkflowStatus, { label: string; tone: PillTone }> = {
  lead: { label: 'Lead', tone: 'warn' },
  open: { label: 'Open', tone: 'live' },
  in_progress: { label: 'In Progress', tone: 'live' },
  completed: { label: 'Completed', tone: 'live' },
  archived: { label: 'Archived', tone: 'dim' }
};

interface MatterStatusBadgeProps {
  status: MatterWorkflowStatus;
  className?: string;
}

export const MatterStatusBadge = ({ status, className }: MatterStatusBadgeProps) => {
  const config = STATUS_VARIANTS[status] ?? STATUS_VARIANTS.lead;
  return (
    <Pill tone={config.tone} className={className}>
      {config.label}
    </Pill>
  );
};
