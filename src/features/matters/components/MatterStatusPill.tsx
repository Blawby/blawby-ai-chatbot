import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import { cn } from '@/shared/utils/cn';

const STATUS_LABELS: Record<MattersSidebarStatus, string> = {
  lead: 'Lead',
  open: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived'
};

const STATUS_CLASSES: Record<MattersSidebarStatus, string> = {
  lead: 'text-amber-400 bg-amber-400/10 ring-amber-400/20',
  open: 'text-amber-400 bg-amber-400/10 ring-amber-400/20',
  in_progress: 'text-blue-400 bg-blue-400/10 ring-blue-400/30',
  completed: 'text-green-400 bg-green-400/10 ring-green-400/30',
  archived: 'text-gray-400 bg-gray-400/10 ring-gray-400/20'
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
