import type { MatterStatus } from '@/shared/types/matterStatus';
import { cn } from '@/shared/utils/cn';

const STATUS_DOT_STYLES: Record<MatterStatus, string> = {
  first_contact: 'text-amber-400',
  intake_pending: 'text-amber-400',
  conflict_check: 'text-sky-400',
  conflicted: 'text-rose-400',
  eligibility: 'text-amber-400',
  referred: 'text-slate-400',
  consultation_scheduled: 'text-amber-400',
  declined: 'text-rose-400',
  engagement_pending: 'text-amber-400',
  active: 'text-emerald-400',
  pleadings_filed: 'text-sky-400',
  discovery: 'text-sky-400',
  mediation: 'text-sky-400',
  pre_trial: 'text-sky-400',
  trial: 'text-sky-400',
  order_entered: 'text-sky-400',
  appeal_pending: 'text-sky-400',
  closed: 'text-slate-400'
};

interface MatterStatusDotProps {
  status: MatterStatus;
  className?: string;
}

export const MatterStatusDot = ({ status, className = '' }: MatterStatusDotProps) => (
  <div className={cn(STATUS_DOT_STYLES[status], 'flex-none rounded-full p-1', className)}>
    <div className="h-3 w-3 rounded-full bg-current opacity-25">
      <div className="h-2 w-2 rounded-full bg-current" />
    </div>
  </div>
);
