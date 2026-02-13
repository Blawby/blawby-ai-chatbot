import { MATTER_STATUS_LABELS, type MatterStatus } from '@/shared/types/matterStatus';
import { cn } from '@/shared/utils/cn';

const STATUS_CLASSES: Record<MatterStatus, string> = {
  first_contact: 'text-amber-600 bg-amber-500/10 ring-amber-500/30',
  intake_pending: 'text-amber-600 bg-amber-500/10 ring-amber-500/30',
  conflict_check: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  conflicted: 'text-rose-600 bg-rose-500/10 ring-rose-500/30',
  eligibility: 'text-amber-600 bg-amber-500/10 ring-amber-500/30',
  referred: 'text-slate-500 bg-slate-500/10 ring-slate-500/30',
  consultation_scheduled: 'text-amber-600 bg-amber-500/10 ring-amber-500/30',
  declined: 'text-rose-600 bg-rose-500/10 ring-rose-500/30',
  engagement_pending: 'text-amber-600 bg-amber-500/10 ring-amber-500/30',
  active: 'text-emerald-600 bg-emerald-500/10 ring-emerald-500/30',
  pleadings_filed: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  discovery: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  mediation: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  pre_trial: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  trial: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  order_entered: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  appeal_pending: 'text-sky-600 bg-sky-500/10 ring-sky-500/30',
  closed: 'text-slate-500 bg-slate-500/10 ring-slate-500/30'
};

interface MatterStatusPillProps {
  status: MatterStatus;
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
    {MATTER_STATUS_LABELS[status]}
  </span>
);
