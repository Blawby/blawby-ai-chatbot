import {
  Target,
  FileText as FileTextIcon,
  Briefcase,
  Activity,
  ExternalLink,
  Circle,
  CheckCircle2,
  ListChecks,
  Folder as FolderIcon,
  ClipboardList,
  DollarSign
} from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { LoadingBlock } from '@/shared/ui/layout';
import { InfoCard } from '@/shared/ui/cards/InfoCard';
import { DetailRow } from '@/shared/ui/detail/DetailRow';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import type { MatterDetail, MatterTask } from '@/features/matters/data/matterTypes';
import type { EngagementDetail } from '@/features/engagements/types/engagement';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { cn } from '@/shared/utils/cn';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';
import { MATTER_STATUS_BADGE_CLASS } from '@/features/matters/utils/matterStatusStyles';

const ENGAGEMENT_STATUS_LABEL: Record<EngagementDetail['status'], string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Approved',
  declined: 'Declined'
};

const BILLING_TYPE_LABEL: Record<MatterDetail['billingType'], string> = {
  hourly: 'Hourly billing',
  fixed: 'Fixed fee',
  contingency: 'Contingency',
  pro_bono: 'Pro bono'
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatterOverviewTabProps {
  detail: MatterDetail;

  // Client/team
  clientLabel: string;
  clientEmail: string | null;
  assigneeLabel: string | null;
  responsibleAttorneyLabel: string | null;

  // Tasks
  tasks: MatterTask[];

  // Engagement
  engagement: EngagementDetail | null;
  engagementLoading: boolean;
  engagementError: string | null;
  onEngagementRetry: () => void;
  onViewEngagement: () => void;
  onCreateEngagement: () => void;
  engagementActionLoading?: boolean;

  // Activity
  timelineItems: TimelineItem[];
  activityLoading: boolean;
  activityError: string | null;
  onActivityRetry: () => void;
  // Billing
  weeklyHoursLabel: string;
  attorneyRateLabel: string | null;
  adminRateLabel: string | null;

  // Navigation handlers
  onOpenClient?: () => void;
  onCreateInvoice: () => void;
  onLogTime: () => void;
  onViewTimesheet: () => void;
  onViewAllActivity: () => void;
  onViewTasks: () => void;
  onTaskClick: () => void;
  onUploadFile: () => void;
  onViewFiles: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDueDate = (dueDate: string | null): string => {
  if (!dueDate) return 'No due date';
  return formatDateOnlyUtc(dueDate);
};

const isOpenTask = (t: MatterTask) => t.status !== 'completed';

const sortByDue = (a: MatterTask, b: MatterTask): number => {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
};

// ---------------------------------------------------------------------------
// Card sub-components
// ---------------------------------------------------------------------------

const OperationalNextStepCard = ({
  tasks,
  engagement,
  engagementLoading,
  engagementError,
  engagementActionLoading,
  onCreateEngagement,
  onViewEngagement,
  onEngagementRetry,
  onViewTasks
}: {
  tasks: MatterTask[];
  engagement: EngagementDetail | null;
  engagementLoading: boolean;
  engagementError: string | null;
  engagementActionLoading?: boolean;
  onCreateEngagement: () => void;
  onViewEngagement: () => void;
  onEngagementRetry: () => void;
  onViewTasks: () => void;
}) => {
  const nextTask = [...tasks].filter(isOpenTask).sort(sortByDue)[0] ?? null;
  const hasEngagement = Boolean(engagement);
  const title = hasEngagement ? 'Review engagement' : 'Create an engagement';
  const body = hasEngagement
    ? 'Continue from the engagement agreement before advancing client work.'
    : 'Create and send an engagement agreement before starting work.';

  return (
    <InfoCard
      icon={Target}
      title="Next step"
      bodyGap="sm"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold text-input-text">{title}</p>
        <p className="text-[13px] leading-5 text-input-placeholder">{body}</p>
        {engagementError && !engagement ? (
          <p className="text-xs text-amber-300">
            Engagement unavailable.{' '}
            <button type="button" className="underline" onClick={onEngagementRetry}>
              Retry
            </button>
          </p>
        ) : null}
        {engagementLoading && !engagement ? <p className="text-xs text-input-placeholder">Checking engagement status...</p> : null}
        {nextTask ? (
          <p className="text-xs text-input-placeholder">Next open task: <span className="text-input-text">{nextTask.name}</span></p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={hasEngagement ? onViewEngagement : onCreateEngagement}
          disabled={engagementLoading || engagementActionLoading}
        >
          {engagementActionLoading ? 'Creating...' : hasEngagement ? 'View engagement' : 'Create engagement'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onViewTasks}>
          Add task
        </Button>
      </div>
    </InfoCard>
  );
};

const EngagementStatusCard = ({
  detail,
  engagement,
  engagementLoading,
  engagementError,
  onEngagementRetry,
  onViewEngagement,
  onCreateEngagement,
  engagementActionLoading
}: Pick<
  MatterOverviewTabProps,
  'detail' | 'engagement' | 'engagementLoading' | 'engagementError' | 'onEngagementRetry' | 'onViewEngagement' | 'onCreateEngagement' | 'engagementActionLoading'
>) => {
  const billingLabel = BILLING_TYPE_LABEL[detail.billingType];
  const rateLabel = detail.attorneyHourlyRate
    ? `$${detail.attorneyHourlyRate}/hr`
    : detail.totalFixedPrice
      ? `$${detail.totalFixedPrice} fixed`
      : null;
  const statusLabel = engagement ? ENGAGEMENT_STATUS_LABEL[engagement.status] : null;
  const summaryParts = [statusLabel, billingLabel, rateLabel].filter((p): p is string => Boolean(p));

  return (
    <InfoCard icon={Briefcase} title="Engagement" bodyGap="sm">
      {engagementLoading && !engagement ? (
        <LoadingBlock label="Loading engagement" />
      ) : engagementError && !engagement ? (
        <div className="space-y-1">
          <p className="text-[13px] text-input-text">No engagement yet</p>
          <p className="text-[12px] text-amber-300">
            Engagement unavailable.{' '}
            <button type="button" className="underline" onClick={onEngagementRetry}>
              Retry
            </button>
          </p>
        </div>
      ) : engagement ? (
        <div className="space-y-1">
          <p className="text-[13px] text-input-text">
            {engagement?.title?.trim() || 'Standard Legal Services Agreement'}
          </p>
          {summaryParts.length > 0 ? (
            <p className="text-[13px] text-input-placeholder">{summaryParts.join(' · ')}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[13px] text-input-text">No engagement yet</p>
          <p className="text-[13px] text-input-placeholder">Create an engagement to get started.</p>
        </div>
      )}
      <div>
        <Button
          size="sm"
          variant={engagement ? 'secondary' : 'primary'}
          icon={engagement ? ExternalLink : undefined}
          iconPosition="right"
          onClick={engagement ? onViewEngagement : onCreateEngagement}
          disabled={engagementLoading || engagementActionLoading}
        >
          {engagementActionLoading ? 'Creating...' : engagement ? 'View engagement' : 'Create engagement'}
        </Button>
      </div>
    </InfoCard>
  );
};

const OPEN_TASKS_PREVIEW_COUNT = 5;

const OpenTasksCard = ({
  tasks,
  onTaskClick,
  onViewTasks
}: {
  tasks: MatterTask[];
  onTaskClick: () => void;
  onViewTasks: () => void;
}) => {
  const openTasks = tasks.filter(isOpenTask);
  const visibleTasks = [...openTasks].sort(sortByDue).slice(0, OPEN_TASKS_PREVIEW_COUNT);

  return (
    <InfoCard
      icon={ListChecks}
      title="Open tasks"
      trailing={<span className="text-[13px] text-input-placeholder">{openTasks.length} {openTasks.length === 1 ? 'task' : 'tasks'}</span>}
    >
      {visibleTasks.length === 0 ? (
        <p className="text-[13px] text-input-placeholder">No open tasks.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-card-border">
          {visibleTasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={onTaskClick}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-card-hover"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {task.status === 'in_progress' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-input-placeholder" aria-hidden="true" />
                  )}
                  <span className="truncate text-[13px] text-input-text">{task.name}</span>
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-input-placeholder">
                  {formatDueDate(task.dueDate)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openTasks.length > 0 ? (
        <button
          type="button"
          onClick={onViewTasks}
          className="text-center text-[13px] font-medium text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300"
        >
          View all tasks
        </button>
      ) : null}
    </InfoCard>
  );
};

const ACTIVITY_PREVIEW_COUNT = 4;

const RecentActivityCard = ({
  timelineItems,
  activityLoading,
  activityError,
  onActivityRetry,
  onTaskClick,
  onViewAllActivity
}: Pick<
  MatterOverviewTabProps,
  | 'timelineItems'
  | 'activityLoading'
  | 'activityError'
  | 'onActivityRetry'
  | 'onTaskClick'
  | 'onViewAllActivity'
>) => {
  const hasMore = timelineItems.length > ACTIVITY_PREVIEW_COUNT;
  const visibleItems = timelineItems.slice(0, ACTIVITY_PREVIEW_COUNT);

  return (
    <InfoCard icon={Activity} title="Recent activity">
      {activityLoading && timelineItems.length === 0 ? (
        <LoadingBlock label="Loading activity" />
      ) : activityError && timelineItems.length === 0 ? (
        <p className="text-[13px] text-input-placeholder">
          Could not load activity.{' '}
          <button type="button" className="underline" onClick={onActivityRetry}>
            Retry
          </button>
        </p>
      ) : (
        <ActivityTimeline
          items={visibleItems}
          onTaskClick={onTaskClick}
        />
      )}
      {timelineItems.length === 0 && !activityLoading && !activityError ? (
        <p className="text-[13px] text-input-placeholder">No recent activity.</p>
      ) : null}
      {hasMore || timelineItems.length > 0 ? (
        <button
          type="button"
          onClick={onViewAllActivity}
          className="text-center text-[13px] font-medium text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300"
        >
          View all activity
        </button>
      ) : null}
    </InfoCard>
  );
};

const MatterSummaryCard = ({
  clientEmail,
  clientLabel,
  detail,
  responsibleAttorneyLabel,
  assigneeLabel,
  onOpenClient
}: {
  clientEmail: string | null;
  clientLabel: string;
  detail: MatterDetail;
  responsibleAttorneyLabel: string | null;
  assigneeLabel: string | null;
  onOpenClient?: () => void;
}) => (
  <InfoCard icon={ClipboardList} title="Matter summary" bodyGap="sm">
    <DetailRow label="Client" value={clientLabel} />
    <DetailRow label="Status" value={<span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', MATTER_STATUS_BADGE_CLASS[detail.status])}>{MATTER_STATUS_LABELS[detail.status]}</span>} />
    <DetailRow label="Practice area" value={detail.practiceArea} />
    <DetailRow label="Case number" value={detail.caseNumber} />
    <DetailRow label="Court" value={detail.court} />
    <DetailRow label="Responsible" value={responsibleAttorneyLabel} />
    <DetailRow label="Assigned" value={assigneeLabel} />
    {clientEmail ? <p className="break-all text-xs text-input-placeholder">{clientEmail}</p> : null}
    {onOpenClient ? (
      <Button
        variant="outline"
        size="sm"
        icon={ExternalLink}
        iconPosition="right"
        onClick={onOpenClient}
        className="w-full justify-center"
      >
        Open client
      </Button>
    ) : null}
  </InfoCard>
);

const BillingCard = ({
  weeklyHoursLabel,
  attorneyRateLabel,
  adminRateLabel,
  onCreateInvoice,
  onLogTime,
  onViewTimesheet
}: Pick<
  MatterOverviewTabProps,
  'weeklyHoursLabel' | 'attorneyRateLabel' | 'adminRateLabel' | 'onCreateInvoice' | 'onLogTime' | 'onViewTimesheet'
>) => {
  const hasBillableTime = !weeklyHoursLabel.startsWith('0:00');
  return (
    <InfoCard icon={DollarSign} title="Billing" bodyGap="sm">
      <p className="text-[22px] font-bold leading-tight text-input-text">
        {weeklyHoursLabel} <span className="text-[13px] font-normal text-input-placeholder">this week</span>
      </p>
      <p className="text-[13px] text-input-placeholder">{hasBillableTime ? 'Billable time is ready to review.' : 'No billable time yet.'}</p>
      <DetailRow label="Attorney" value={attorneyRateLabel} />
      <DetailRow label="Admin" value={adminRateLabel} />
      <Button variant={hasBillableTime ? 'primary' : 'secondary'} size="sm" onClick={hasBillableTime ? onCreateInvoice : onLogTime} className="w-full justify-center">
        {hasBillableTime ? 'Invoice' : 'Log time'}
      </Button>
      <button
        type="button"
        onClick={onViewTimesheet}
        className="text-center text-[13px] font-medium text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300"
      >
        View timesheet
      </button>
    </InfoCard>
  );
};

const RecentFilesCard = ({
  onUploadFile,
  onViewFiles
}: {
  onUploadFile: () => void;
  onViewFiles: () => void;
}) => (
  <InfoCard icon={FolderIcon} title="Recent files" bodyGap="sm">
    <p className="text-[13px] text-input-placeholder">No files uploaded yet.</p>
    <Button
      variant="outline"
      size="sm"
      icon={FileTextIcon}
      onClick={onUploadFile}
      className="w-full justify-center"
    >
      Upload file
    </Button>
    <button
      type="button"
      onClick={onViewFiles}
      className="text-center text-[13px] font-medium text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300"
    >
      View all files
    </button>
  </InfoCard>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const MatterOverviewTab = (props: MatterOverviewTabProps) => {
  const {
    detail,
    clientLabel,
    clientEmail,
    assigneeLabel,
    responsibleAttorneyLabel,
    tasks,
    engagement,
    engagementLoading,
    engagementError,
    onEngagementRetry,
    onViewEngagement,
    onCreateEngagement,
    engagementActionLoading,
    timelineItems,
    activityLoading,
    activityError,
    onActivityRetry,
    weeklyHoursLabel,
    attorneyRateLabel,
    adminRateLabel,
    onOpenClient,
    onCreateInvoice,
    onLogTime,
    onViewTimesheet,
    onViewAllActivity,
    onViewTasks,
    onTaskClick,
    onUploadFile,
    onViewFiles
  } = props;

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <OperationalNextStepCard
            tasks={tasks}
            engagement={engagement}
            engagementLoading={engagementLoading}
            engagementError={engagementError}
            engagementActionLoading={engagementActionLoading}
            onCreateEngagement={onCreateEngagement}
            onViewEngagement={onViewEngagement}
            onEngagementRetry={onEngagementRetry}
            onViewTasks={onViewTasks}
          />
          <EngagementStatusCard
            detail={detail}
            engagement={engagement}
            engagementLoading={engagementLoading}
            engagementError={engagementError}
            onEngagementRetry={onEngagementRetry}
            onViewEngagement={onViewEngagement}
            onCreateEngagement={onCreateEngagement}
            engagementActionLoading={engagementActionLoading}
          />
          {tasks.some(isOpenTask) ? <OpenTasksCard tasks={tasks} onTaskClick={onTaskClick} onViewTasks={onViewTasks} /> : null}
          <RecentActivityCard
            timelineItems={timelineItems}
            activityLoading={activityLoading}
            activityError={activityError}
            onActivityRetry={onActivityRetry}
            onTaskClick={onTaskClick}
            onViewAllActivity={onViewAllActivity}
          />
        </div>
        <div className="space-y-5">
          <MatterSummaryCard
            clientEmail={clientEmail}
            clientLabel={clientLabel}
            detail={detail}
            responsibleAttorneyLabel={responsibleAttorneyLabel}
            assigneeLabel={assigneeLabel}
            onOpenClient={onOpenClient}
          />
          <BillingCard
            weeklyHoursLabel={weeklyHoursLabel}
            attorneyRateLabel={attorneyRateLabel}
            adminRateLabel={adminRateLabel}
            onCreateInvoice={onCreateInvoice}
            onLogTime={onLogTime}
            onViewTimesheet={onViewTimesheet}
          />
          <RecentFilesCard onUploadFile={onUploadFile} onViewFiles={onViewFiles} />
        </div>
      </div>
    </div>
  );
};
