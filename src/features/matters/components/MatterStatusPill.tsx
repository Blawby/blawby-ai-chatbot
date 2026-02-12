import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import { cn } from '@/shared/utils/cn';

const STATUS_LABELS: Record<MattersSidebarStatus, string> = {
  draft: 'Draft',
  active: 'Active'
};

const STATUS_CLASSES: Record<MattersSidebarStatus, string> = {
  draft: 'text-amber-400 bg-amber-400/10 ring-amber-400/20',
  active: 'text-emerald-400 bg-emerald-400/10 ring-emerald-400/30'
};

interface MatterStatusPillProps {
  status: MattersSidebarStatus;
  className?: string;
}

export const MatterStatusPill = ({ status, className = '' }: MatterStatusPillProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
      STATUS_CLASSES[status],
      className
    )}
  >
    {STATUS_LABELS[status]}
  </span>
);
