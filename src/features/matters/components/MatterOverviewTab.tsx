import {
  Target,
  FileText as FileTextIcon,
  Briefcase,
  Activity,
  User as UserIcon,
  ExternalLink,
  Circle,
  CheckCircle2,
  ListChecks,
  ArrowRight,
  Folder as FolderIcon,
  ClipboardList,
  DollarSign
} from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { LoadingBlock } from '@/shared/ui/layout';
import { InfoCard } from '@/shared/ui/cards/InfoCard';
import { DetailRow } from '@/shared/ui/detail/DetailRow';
import { ActivityTimeline, type TimelineItem, type TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import type { MatterDetail, MatterTask } from '@/features/matters/data/matterTypes';
import type { EngagementDetail } from '@/features/engagements/types/engagement';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { cn } from '@/shared/utils/cn';

const microLabel = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-input-placeholder';

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

  // Activity
  timelineItems: TimelineItem[];
  activityLoading: boolean;
  activityError: string | null;
  onActivityRetry: () => void;
  onCreateNote: (content: string) => Promise<void>;
  composerPerson: TimelinePerson;
  composerPracticeId: string | null;

  // Billing
  weeklyHoursLabel: string;
  attorneyRateLabel: string | null;
  adminRateLabel: string | null;

  // Navigation handlers
  onOpenClient?: () => void;
  onCreateInvoice: () => void;
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

const NextActionCard = ({
  tasks,
  onViewTasks
}: {
  tasks: MatterTask[];
  onViewTasks: () => void;
}) => {
  const nextTask = [...tasks].filter(isOpenTask).sort(sortByDue)[0] ?? null;

  return (
    <InfoCard
      icon={Target}
      title="Next action"
      bodyGap="sm"
      trailing={
        <Button
          size="sm"
          variant="secondary"
          icon={ArrowRight}
          iconPosition="right"
          onClick={onViewTasks}
        >
          View tasks
        </Button>
      }
    >
      <p className={cn('text-[13px]', nextTask ? 'text-input-text' : 'text-input-placeholder')}>
        {nextTask
          ? `${nextTask.name} — due ${formatDueDate(nextTask.dueDate)}`
          : 'No upcoming tasks.'}
      </p>
    </InfoCard>
  );
};

const EngagementCard = ({
  detail,
  engagement,
  engagementLoading,
  engagementError,
  onEngagementRetry,
  onViewEngagement
}: Pick<
  MatterOverviewTabProps,
  'detail' | 'engagement' | 'engagementLoading' | 'engagementError' | 'onEngagementRetry' | 'onViewEngagement'
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
        <p className="text-[13px] text-input-placeholder">
          Could not load engagement.{' '}
          <button type="button" className="underline" onClick={onEngagementRetry}>
            Retry
          </button>
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-[13px] text-input-text">
            {engagement?.title?.trim() || 'Standard Legal Services Agreement'}
          </p>
          {summaryParts.length > 0 ? (
            <p className="text-[13px] text-input-placeholder">{summaryParts.join(' · ')}</p>
          ) : null}
        </div>
      )}
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={ExternalLink}
          iconPosition="right"
          onClick={onViewEngagement}
          disabled={!engagement}
        >
          View engagement
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
                className="flex w-full items-center justify-between gap-3 py-2 text-left transition-colors hover:bg-card"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {task.status === 'in_progress' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-500" aria-hidden="true" />
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
  onCreateNote,
  composerPerson,
  composerPracticeId,
  onTaskClick,
  onViewAllActivity
}: Pick<
  MatterOverviewTabProps,
  | 'timelineItems'
  | 'activityLoading'
  | 'activityError'
  | 'onActivityRetry'
  | 'onCreateNote'
  | 'composerPerson'
  | 'composerPracticeId'
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
          showComposer
          composerDisabled={activityLoading}
          composerLabel="Comment"
          composerPlaceholder="Add your comment..."
          composerPracticeId={composerPracticeId}
          composerPerson={composerPerson}
          onTaskClick={onTaskClick}
          onComposerSubmit={async (value) => {
            await onCreateNote(value);
          }}
        />
      )}
      {hasMore ? (
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

const ClientCard = ({
  clientEmail,
  clientLabel,
  onOpenClient
}: {
  clientEmail: string | null;
  clientLabel: string;
  onOpenClient?: () => void;
}) => (
  <InfoCard icon={UserIcon} title="Client">
    <div className="space-y-1">
      <p className={microLabel}>Email</p>
      <p className="break-all text-[13px] text-input-text">{clientEmail ?? clientLabel}</p>
    </div>
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
  onViewTimesheet
}: Pick<
  MatterOverviewTabProps,
  'weeklyHoursLabel' | 'attorneyRateLabel' | 'adminRateLabel' | 'onCreateInvoice' | 'onViewTimesheet'
>) => (
  <InfoCard icon={DollarSign} title="Billing" bodyGap="sm">
    <p className="text-[22px] font-bold leading-tight text-input-text">
      {weeklyHoursLabel} <span className="text-[13px] font-normal text-input-placeholder">this week</span>
    </p>
    <DetailRow label="Attorney" value={attorneyRateLabel} />
    <DetailRow label="Admin" value={adminRateLabel} />
    <Button variant="primary" size="sm" onClick={onCreateInvoice} className="w-full justify-center">
      Invoice
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

const RecentFilesCard = ({
  onUploadFile,
  onViewFiles: _onViewFiles
}: {
  onUploadFile: () => void;
  onViewFiles: () => void;
}) => (
  <InfoCard icon={FolderIcon} title="Recent files" bodyGap="sm">
    <p className="text-[13px] text-input-placeholder">No files uploaded yet</p>
    <Button
      variant="outline"
      size="sm"
      icon={FileTextIcon}
      onClick={onUploadFile}
      className="w-full justify-center"
    >
      Upload file
    </Button>
  </InfoCard>
);

const KeyFactsCard = ({
  detail,
  responsibleAttorneyLabel,
  assigneeLabel
}: {
  detail: MatterDetail;
  responsibleAttorneyLabel: string | null;
  assigneeLabel: string | null;
}) => (
  <InfoCard icon={ClipboardList} title="Key facts" bodyGap="sm">
    <DetailRow label="Matter type" value={detail.matterType} />
    <DetailRow label="Case number" value={detail.caseNumber} />
    <DetailRow label="Court" value={detail.court} />
    <DetailRow label="Judge" value={detail.judge} />
    <DetailRow label="Opposing party" value={detail.opposingParty} />
    <DetailRow label="Responsible attorney" value={responsibleAttorneyLabel} />
    <DetailRow label="Assigned" value={assigneeLabel} />
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
    timelineItems,
    activityLoading,
    activityError,
    onActivityRetry,
    onCreateNote,
    composerPerson,
    composerPracticeId,
    weeklyHoursLabel,
    attorneyRateLabel,
    adminRateLabel,
    onOpenClient,
    onCreateInvoice,
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
          <NextActionCard tasks={tasks} onViewTasks={onViewTasks} />
          <EngagementCard
            detail={detail}
            engagement={engagement}
            engagementLoading={engagementLoading}
            engagementError={engagementError}
            onEngagementRetry={onEngagementRetry}
            onViewEngagement={onViewEngagement}
          />
          <OpenTasksCard tasks={tasks} onTaskClick={onTaskClick} onViewTasks={onViewTasks} />
          <RecentActivityCard
            timelineItems={timelineItems}
            activityLoading={activityLoading}
            activityError={activityError}
            onActivityRetry={onActivityRetry}
            onCreateNote={onCreateNote}
            composerPerson={composerPerson}
            composerPracticeId={composerPracticeId}
            onTaskClick={onTaskClick}
            onViewAllActivity={onViewAllActivity}
          />
        </div>
        <div className="space-y-5">
          <ClientCard clientEmail={clientEmail} clientLabel={clientLabel} onOpenClient={onOpenClient} />
          <BillingCard
            weeklyHoursLabel={weeklyHoursLabel}
            attorneyRateLabel={attorneyRateLabel}
            adminRateLabel={adminRateLabel}
            onCreateInvoice={onCreateInvoice}
            onViewTimesheet={onViewTimesheet}
          />
          <RecentFilesCard onUploadFile={onUploadFile} onViewFiles={onViewFiles} />
          <KeyFactsCard
            detail={detail}
            responsibleAttorneyLabel={responsibleAttorneyLabel}
            assigneeLabel={assigneeLabel}
          />
        </div>
      </div>
    </div>
  );
};
