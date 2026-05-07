import type { MatterStatus } from '@/shared/types/matterStatus';
import { cn } from '@/shared/utils/cn';
import { MATTER_STATUS_DOT_CLASS } from '@/features/matters/utils/matterStatusStyles';

interface MatterStatusDotProps {
  status: MatterStatus;
  className?: string;
}

export const MatterStatusDot = ({ status, className = '' }: MatterStatusDotProps) => (
  <div className={cn(MATTER_STATUS_DOT_CLASS[status], 'flex-none rounded-full p-1', className)}>
    <div className="h-3 w-3 rounded-full bg-current opacity-25">
      <div className="h-2 w-2 rounded-full bg-current" />
    </div>
  </div>
);
