import type { MatterStatus } from '@/shared/types/matterStatus';
import { cn } from '@/shared/utils/cn';

const STATUS_DOT_STYLES: Record<MatterStatus, string> = {
 first_contact: 'text-[rgb(var(--warning-foreground))] dark:text-[rgb(var(--warning-foreground))]',
 intake_pending: 'text-[rgb(var(--warning-foreground))] dark:text-[rgb(var(--warning-foreground))]',
 conflict_check: 'text-sky-600 ',
 conflicted: 'text-[rgb(var(--error-foreground))] dark:text-[rgb(var(--error-foreground))]',
 eligibility: 'text-[rgb(var(--warning-foreground))] dark:text-[rgb(var(--warning-foreground))]',
 referred: 'text-slate-600 ',
 consultation_scheduled: 'text-[rgb(var(--warning-foreground))] dark:text-[rgb(var(--warning-foreground))]',
 declined: 'text-[rgb(var(--error-foreground))] dark:text-[rgb(var(--error-foreground))]',
 intake_accepted: 'text-blue-600 ',
 engagement_draft: 'text-[rgb(var(--warning-foreground))] dark:text-[rgb(var(--warning-foreground))]',
 engagement_sent: 'text-violet-600 ',
 engagement_accepted: 'text-[rgb(var(--success-foreground))] dark:text-[rgb(var(--success-foreground))]',
 engagement_pending: 'text-[rgb(var(--warning-foreground))] dark:text-[rgb(var(--warning-foreground))]',
 active: 'text-[rgb(var(--success-foreground))] dark:text-[rgb(var(--success-foreground))]',
 pleadings_filed: 'text-sky-600 ',
 discovery: 'text-sky-600 ',
 mediation: 'text-sky-600 ',
 pre_trial: 'text-sky-600 ',
 trial: 'text-sky-600 ',
 order_entered: 'text-sky-600 ',
 appeal_pending: 'text-sky-600 ',
 closed: 'text-slate-600 '
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
