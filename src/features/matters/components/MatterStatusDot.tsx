import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import { cn } from '@/shared/utils/cn';

const STATUS_DOT_STYLES: Record<MattersSidebarStatus, string> = {
  draft: 'text-amber-400',
  active: 'text-emerald-400'
};

interface MatterStatusDotProps {
  status: MattersSidebarStatus;
  className?: string;
}

export const MatterStatusDot = ({ status, className = '' }: MatterStatusDotProps) => (
  <div className={cn(STATUS_DOT_STYLES[status], 'flex-none rounded-full p-1', className)}>
    <div className="h-3 w-3 rounded-full bg-current opacity-25">
      <div className="h-2 w-2 rounded-full bg-current" />
    </div>
  </div>
);
