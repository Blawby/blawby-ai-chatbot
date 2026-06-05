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
import { AIAnswerCard, StagedAction, type AIAnswerCardAction, type AIAnswerCardSource } from '@/design-system/patterns';
import { MatterAskCard } from '@/features/matters/components/MatterAskCard';
import type { MatterDetail, MatterTask } from '@/features/matters/data/matterTypes';
import type { EngagementDetail } from '@/features/engagements/types/engagement';
import type { UnbilledSummary } from '@/features/matters/types/billing.types';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { cn } from '@/shared/utils/cn';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';
import { MATTER_STATUS_BADGE_CLASS } from '@/features/matters/utils/matterStatusStyles';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { getMajorAmountValue } from '@/shared/utils/money';

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

  // Engagement (view-only — engagements are created from accepted intake
  // contracts, never from the matter detail, so there is no "create" action here)
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
  // Billing
  weeklyHoursLabel: string;
  attorneyRateLabel: string | null;
  adminRateLabel: string | null;
  /** Unbilled-time summary used by the AI summary lede + StagedAction card. */
  unbilledSummary?: UnbilledSummary | null;

  // Navigation handlers
  onOpenClient?: () => void;
  onCreateInvoice: () => void;
  onLogTime: () => void;
  onViewTimesheet: () => void;
  onViewAllActivity: () => void;
  onViewTasks: () => void;
  onAddTask: () => void;
  onTaskClick: () => void;
  onUploadFile: () => void;
  onViewFiles: () => void;
  /** Open the practice assistant scoped to this matter — used by the AI summary action. */
  onReplyToClient?: () => void;
  /** Approve the staged invoice draft. Defaults to onCreateInvoice if unset. */
  onApproveInvoiceDraft?: () => void;
  /**
   * Fires when the user submits a question in the right-rail
   * "Ask about this matter" card. When undefined, the card isn't rendered.
   * TODO(backend): wire to the scoped practice-assistant route.
   */
  onAskAboutMatter?: (query: string) => void;
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

// Time helpers used by the AI summary lede.
const daysOnMatter = (detail: MatterDetail, now = Date.now()): number | null => {
  const opened = detail.openDate ?? detail.createdAt;
  if (!opened) return null;
  const t = new Date(opened).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
};

// Formats a relative time like "just now" / "2h ago" / "yesterday".
const relativeTimeLabel = (): string => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

// ---------------------------------------------------------------------------
// AI assistant summary card — top of Overview
// ---------------------------------------------------------------------------

/**
 * Builds the deterministic AI summary card content from real matter data.
 * No backend AI call — the lede is grounded narration of facts the page
 * already has (matter age, retainer threshold, unbilled time, next
 * deadline). TODO(backend): replace this with the streaming
 * `practice-assistant.summary` endpoint once it lands and accepts a
 * scoped `matter_id` parameter.
 */
const buildAssistantSummary = (
  detail: MatterDetail,
  clientLabel: string,
  unbilledSummary: UnbilledSummary | null,
  tasks: MatterTask[],
  timelineItems: TimelineItem[]
) => {
  const days = daysOnMatter(detail);
  const unbilledHours = unbilledSummary?.unbilledTime.hours ?? 0;
  const unbilledAmount = unbilledSummary ? getMajorAmountValue(unbilledSummary.unbilledTime.amount) : 0;

  const nextOpenTask = [...tasks].filter(isOpenTask).sort(sortByDue)[0] ?? null;
  const nextDeadlineLabel = nextOpenTask?.dueDate ? formatDateOnlyUtc(nextOpenTask.dueDate) : null;

  // Lede sentences — pruned to only what we actually know. Each clause is
  // grounded in concrete data so the model never hallucinates numbers.
  const sentences: string[] = [];
  if (clientLabel && clientLabel !== 'Unassigned client') {
    sentences.push(
      days !== null
        ? `${clientLabel} has been on this matter ${days} ${days === 1 ? 'day' : 'days'}.`
        : `${clientLabel} is the client on this matter.`
    );
  }
  if (unbilledHours > 0) {
    sentences.push(
      `You have ${unbilledHours.toFixed(unbilledHours % 1 === 0 ? 0 : 1)} unbilled ${unbilledHours === 1 ? 'hour' : 'hours'} totaling ${formatCurrency(unbilledAmount)}.`
    );
  }
  if (nextDeadlineLabel) {
    sentences.push(`Next deadline: ${nextDeadlineLabel}.`);
  }
  if (sentences.length === 0) {
    sentences.push('No activity yet — this matter is freshly opened.');
  }
  const lede = sentences.join(' ');

  // Action chips — keep the set small (≤4) and only surface actions whose
  // preconditions are met. The chips fire deterministic handlers; the
  // Approve invoice chip is gated on having unbilled value.
  const actions: AIAnswerCardAction[] = [];
  if (unbilledAmount > 0) {
    actions.push({ id: 'approve-invoice', label: `Approve invoice draft`, variant: 'primary', onClick: () => {} });
  }
  actions.push({ id: 'reply', label: 'Reply to client', onClick: () => {} });
  actions.push({ id: 'engagement-update', label: 'Draft engagement update', onClick: () => {} });
  actions.push({ id: 'settlement', label: 'Settlement projection', onClick: () => {} });

  // Source citations — real database tables that ground the summary.
  // TODO(backend): when the AI route exists, the response itself will
  // return the actual source row ids; for now we surface table-level
  // grounding so the citation row never lies.
  const sources: AIAnswerCardSource[] = [
    { table: 'matters', count: 1 },
    { table: 'time_entries', count: unbilledSummary?.unbilledTime.entries ?? 0 },
    { table: 'tasks', count: tasks.length },
    { table: 'activity', count: timelineItems.length }
  ];

  // Grounding label — count distinct sources surfaced.
  const grounded = sources.reduce((sum, s) => sum + s.count, 0);
  const groundingLabel = `Practice assistant · grounded in ${grounded} ${grounded === 1 ? 'source' : 'sources'} · ${relativeTimeLabel()}`;

  return { lede, actions, sources, groundingLabel };
};

const AISummaryCard = ({
  detail,
  clientLabel,
  unbilledSummary,
  tasks,
  timelineItems,
  onApproveInvoice,
  onReplyToClient,
  onViewEngagement
}: {
  detail: MatterDetail;
  clientLabel: string;
  unbilledSummary: UnbilledSummary | null;
  tasks: MatterTask[];
  timelineItems: TimelineItem[];
  onApproveInvoice: () => void;
  onReplyToClient: () => void;
  onViewEngagement: () => void;
}) => {
  const { lede, actions, sources, groundingLabel } = buildAssistantSummary(
    detail,
    clientLabel,
    unbilledSummary,
    tasks,
    timelineItems
  );

  // Bind real handlers to the action chips by id.
  const boundActions = actions.map((action) => {
    switch (action.id) {
      case 'approve-invoice':
        return { ...action, onClick: onApproveInvoice };
      case 'reply':
        return { ...action, onClick: onReplyToClient };
      case 'engagement-update':
        return { ...action, onClick: onViewEngagement };
      case 'settlement':
        // TODO(backend): wire to settlement projection AI route — for now
        // reuse the engagement view as the closest existing surface.
        return { ...action, onClick: onViewEngagement };
      default:
        return action;
    }
  });

  return (
    <AIAnswerCard
      groundingLabel={groundingLabel}
      lede={lede}
      actions={boundActions}
      sources={sources}
    />
  );
};

// ---------------------------------------------------------------------------
// Staged invoice action — inline beneath AI summary, only when there's
// unbilled time waiting. NEVER auto-executes (StagedAction primitive contract).
// ---------------------------------------------------------------------------

const StagedInvoiceAction = ({
  unbilledSummary,
  onCreateInvoice
}: {
  unbilledSummary: UnbilledSummary | null;
  onCreateInvoice: () => void;
}) => {
  const hours = unbilledSummary?.unbilledTime.hours ?? 0;
  const amountMajor = unbilledSummary ? getMajorAmountValue(unbilledSummary.unbilledTime.amount) : 0;
  if (hours <= 0 || amountMajor <= 0) return null;

  return (
    <StagedAction
      label="Staged · awaits your approval"
      title={`Invoice draft · ${formatCurrency(amountMajor)}`}
      description={
        <>
          {hours.toFixed(hours % 1 === 0 ? 0 : 1)} unbilled {hours === 1 ? 'hour' : 'hours'} aggregated from
          the current pay period. Approving opens the draft in the invoice editor — the invoice is not sent
          until you review the line items and click <strong>Send</strong>.
        </>
      }
      actions={
        <>
          <Button size="sm" variant="primary" onClick={onCreateInvoice}>
            Draft invoice
          </Button>
          <Button size="sm" variant="ghost" onClick={onCreateInvoice}>
            Review entries
          </Button>
        </>
      }
    />
  );
};

// ---------------------------------------------------------------------------
// Card sub-components — preserved from prior implementation
// ---------------------------------------------------------------------------

const OperationalNextStepCard = ({
  tasks,
  engagement,
  engagementLoading,
  engagementError,
  onViewEngagement,
  onEngagementRetry,
  onAddTask
}: {
  tasks: MatterTask[];
  engagement: EngagementDetail | null;
  engagementLoading: boolean;
  engagementError: string | null;
  onViewEngagement: () => void;
  onEngagementRetry: () => void;
  onAddTask: () => void;
}) => {
  const nextTask = [...tasks].filter(isOpenTask).sort(sortByDue)[0] ?? null;
  const hasEngagement = Boolean(engagement);
  const title = hasEngagement ? 'Review engagement' : 'Add your next task';
  const body = hasEngagement
    ? 'Continue from the engagement agreement before advancing client work.'
    : 'Track the work for this matter by adding and assigning tasks.';

  return (
    <InfoCard
      icon={Target}
      title="Next step"
      bodyGap="sm"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-[13px] leading-5 text-dim-2">{body}</p>
        {engagementError && !engagement ? (
          <p className="text-xs text-amber-300">
            Engagement unavailable.{' '}
            <button type="button" className="underline" onClick={onEngagementRetry}>
              Retry
            </button>
          </p>
        ) : null}
        {engagementLoading && !engagement ? <p className="text-xs text-dim-2">Checking engagement status...</p> : null}
        {nextTask ? (
          <p className="text-xs text-dim-2">Next open task: <span className="text-ink">{nextTask.name}</span></p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {hasEngagement ? (
          <Button
            size="sm"
            variant="primary"
            onClick={onViewEngagement}
            disabled={engagementLoading}
          >
            View engagement
          </Button>
        ) : null}
        <Button size="sm" variant={hasEngagement ? 'secondary' : 'primary'} onClick={onAddTask}>
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

  // A matter always has an engagement, so never surface a "missing engagement"
  // state. Show this card only once an engagement is loaded — or while loading /
  // on error so the user can retry — and render nothing otherwise.
  if (!engagement && !engagementLoading && !engagementError) return null;

  return (
    <InfoCard icon={Briefcase} title="Engagement" bodyGap="sm">
      {engagementLoading && !engagement ? (
        <LoadingBlock label="Loading engagement" />
      ) : engagementError && !engagement ? (
        <div className="space-y-1">
          <p className="text-[13px] text-ink">Engagement unavailable</p>
          <p className="text-[12px] text-amber-300">
            <button type="button" className="underline" onClick={onEngagementRetry}>
              Retry
            </button>
          </p>
        </div>
      ) : engagement ? (
        <div className="space-y-1">
          <p className="text-[13px] text-ink">
            {engagement?.title?.trim() || 'Standard Legal Services Agreement'}
          </p>
          {summaryParts.length > 0 ? (
            <p className="text-[13px] text-dim-2">{summaryParts.join(' · ')}</p>
          ) : null}
        </div>
      ) : null}
      {engagement ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={ExternalLink}
            iconPosition="right"
            onClick={onViewEngagement}
            disabled={engagementLoading}
          >
            View engagement
          </Button>
        </div>
      ) : null}
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
      trailing={<span className="text-[13px] text-dim-2">{openTasks.length} {openTasks.length === 1 ? 'task' : 'tasks'}</span>}
    >
      {visibleTasks.length === 0 ? (
        <p className="text-[13px] text-dim-2">No open tasks.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-card-border">
          {visibleTasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={onTaskClick}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-paper-2"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {task.status === 'in_progress' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-dim-2" aria-hidden="true" />
                  )}
                  <span className="truncate text-[13px] text-ink">{task.name}</span>
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-dim-2">
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
          className="text-center text-[13px] font-medium text-accent hover:text-accent-deep dark:text-accent dark:hover:text-accent-deep"
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
        <p className="text-[13px] text-dim-2">
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
        <p className="text-[13px] text-dim-2">No recent activity.</p>
      ) : null}
      {hasMore || timelineItems.length > 0 ? (
        <button
          type="button"
          onClick={onViewAllActivity}
          className="text-center text-[13px] font-medium text-accent hover:text-accent-deep dark:text-accent dark:hover:text-accent-deep"
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
    {clientEmail ? <p className="break-all text-xs text-dim-2">{clientEmail}</p> : null}
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
      <p className="text-[22px] font-bold leading-tight text-ink">
        {weeklyHoursLabel} <span className="text-[13px] font-normal text-dim-2">this week</span>
      </p>
      <p className="text-[13px] text-dim-2">{hasBillableTime ? 'Billable time is ready to review.' : 'No billable time yet.'}</p>
      <DetailRow label="Attorney" value={attorneyRateLabel} />
      <DetailRow label="Admin" value={adminRateLabel} />
      <Button variant={hasBillableTime ? 'primary' : 'secondary'} size="sm" onClick={hasBillableTime ? onCreateInvoice : onLogTime} className="w-full justify-center">
        {hasBillableTime ? 'Invoice' : 'Log time'}
      </Button>
      <button
        type="button"
        onClick={onViewTimesheet}
        className="text-center text-[13px] font-medium text-accent hover:text-accent-deep dark:text-accent dark:hover:text-accent-deep"
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
    <p className="text-[13px] text-dim-2">No files uploaded yet.</p>
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
      className="text-center text-[13px] font-medium text-accent hover:text-accent-deep dark:text-accent dark:hover:text-accent-deep"
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
    timelineItems,
    activityLoading,
    activityError,
    onActivityRetry,
    weeklyHoursLabel,
    attorneyRateLabel,
    adminRateLabel,
    unbilledSummary,
    onOpenClient,
    onCreateInvoice,
    onLogTime,
    onViewTimesheet,
    onViewAllActivity,
    onViewTasks,
    onAddTask,
    onTaskClick,
    onUploadFile,
    onViewFiles,
    onReplyToClient,
    onApproveInvoiceDraft,
    onAskAboutMatter
  } = props;

  const approveInvoice = onApproveInvoiceDraft ?? onCreateInvoice;
  // "Reply to client" defaults to opening the engagement (closest existing
  // contact surface); a real reply requires the practice-assistant matter
  // route. TODO(backend): replace with the scoped chat endpoint.
  const replyToClient = onReplyToClient ?? onViewEngagement;

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* AI summary card — centerpiece chat-first element */}
          <AISummaryCard
            detail={detail}
            clientLabel={clientLabel}
            unbilledSummary={unbilledSummary ?? null}
            tasks={tasks}
            timelineItems={timelineItems}
            onApproveInvoice={approveInvoice}
            onReplyToClient={replyToClient}
            onViewEngagement={onViewEngagement}
          />

          {/* Staged invoice action — only rendered when there's unbilled time */}
          <StagedInvoiceAction
            unbilledSummary={unbilledSummary ?? null}
            onCreateInvoice={approveInvoice}
          />

          <OperationalNextStepCard
            tasks={tasks}
            engagement={engagement}
            engagementLoading={engagementLoading}
            engagementError={engagementError}
            onViewEngagement={onViewEngagement}
            onEngagementRetry={onEngagementRetry}
            onAddTask={onAddTask}
          />
          <EngagementStatusCard
            detail={detail}
            engagement={engagement}
            engagementLoading={engagementLoading}
            engagementError={engagementError}
            onEngagementRetry={onEngagementRetry}
            onViewEngagement={onViewEngagement}
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
          {/* Pinned "Ask about this matter" card — first thing in the right
              rail, per the canonical Matter.html design. */}
          {onAskAboutMatter ? (
            <MatterAskCard
              onSubmit={onAskAboutMatter}
              suggestions={[
                'Summarize recent activity',
                "What's outstanding?",
                'Draft a reply to the client',
                "What's the next deadline?"
              ]}
            />
          ) : null}
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
