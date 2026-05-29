import { Inbox } from 'lucide-preact';

import { InfoCard } from '@/shared/ui/cards/InfoCard';
import { Seg } from '@/design-system/patterns';
import { MatterTasksPanel } from '@/features/matters/components/tasks/MatterTasksPanel';
import { MatterMilestonesPanel } from '@/features/matters/components/milestones/MatterMilestonesPanel';

import type {
  MatterDetail,
  MatterOption,
  MatterTask
} from '@/features/matters/data/matterTypes';
import type { MatterTaskFormValues } from '@/features/matters/components/tasks/MatterTaskForm';
import type { UpdateMatterTaskPayload } from '@/features/matters/services/mattersApi';
import type { MajorAmount } from '@/shared/utils/money';

export type WorkSubTab = 'tasks' | 'milestones';

const WORK_SEGMENTS: ReadonlyArray<{ id: WorkSubTab; label: string }> = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'milestones', label: 'Milestones' }
];

type MilestonePatch = {
  description: string;
  amount: MajorAmount;
  dueDate: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'overdue';
};

export interface MatterWorkTabProps {
  detail: MatterDetail;
  subTab: WorkSubTab;
  onSubTabChange: (next: WorkSubTab) => void;

  tasks: MatterTask[];
  tasksLoading: boolean;
  tasksError: string | null;
  tasksNotImplemented: boolean;
  assignees: MatterOption[];
  /** When true, the tasks panel is view-only (e.g. closed matters). */
  tasksReadOnly?: boolean;
  onCreateTask?: (values: MatterTaskFormValues) => Promise<void>;
  onUpdateTask?: (task: MatterTask, patch: UpdateMatterTaskPayload) => Promise<void>;
  onDeleteTask?: (task: MatterTask) => Promise<void>;
  /** Open the task-create form on mount (driven by the overview "Add task" CTA). */
  autoComposeTask?: boolean;
  onComposeTaskHandled?: () => void;

  milestones: MatterDetail['milestones'];
  milestonesLoading: boolean;
  milestonesError: string | null;
  onCreateMilestone: (values: MilestonePatch) => Promise<void>;
  onUpdateMilestone: (milestone: NonNullable<MatterDetail['milestones']>[number], values: MilestonePatch) => Promise<void>;
  onDeleteMilestone: (milestone: NonNullable<MatterDetail['milestones']>[number]) => Promise<void>;
  onReorderMilestones: (next: MatterDetail['milestones']) => Promise<void>;
}

export const MatterWorkTab = ({
  detail,
  subTab,
  onSubTabChange,
  tasks,
  tasksLoading,
  tasksError,
  tasksNotImplemented,
  assignees,
  tasksReadOnly = false,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  autoComposeTask = false,
  onComposeTaskHandled,
  milestones,
  milestonesLoading,
  milestonesError,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onReorderMilestones
}: MatterWorkTabProps) => {
  const milestonesEnabled =
    detail.billingType === 'fixed' && detail.paymentFrequency === 'milestone';

  return (
    <div className="space-y-5">
      <Seg<WorkSubTab>
        value={subTab}
        options={WORK_SEGMENTS.map((segment) => ({ value: segment.id, label: segment.label }))}
        onChange={onSubTabChange}
        ariaLabel="Work section"
        className="w-full sm:w-auto sm:min-w-[16rem]"
      />

      {subTab === 'tasks' ? (
        tasksNotImplemented ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-ink">Tasks coming soon</p>
            <p className="text-xs text-dim-2">
              Task management for this matter is not yet available.
            </p>
          </div>
        ) : (
          <MatterTasksPanel
            tasks={tasks}
            loading={tasksLoading}
            error={tasksError}
            assignees={assignees}
            readOnly={tasksReadOnly}
            onCreateTask={onCreateTask}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            autoOpenCreate={autoComposeTask}
            onAutoOpenHandled={onComposeTaskHandled}
          />
        )
      ) : null}

      {subTab === 'milestones' ? (
        milestonesEnabled ? (
          <MatterMilestonesPanel
            key={`milestones-${detail.id}`}
            matter={detail}
            milestones={milestones}
            loading={milestonesLoading}
            error={milestonesError}
            onCreateMilestone={onCreateMilestone}
            onUpdateMilestone={onUpdateMilestone}
            onDeleteMilestone={onDeleteMilestone}
            onReorderMilestones={onReorderMilestones}
            allowReorder
          />
        ) : (
          <InfoCard icon={Inbox} title="Milestones">
            <p className="text-sm text-dim-2">
              Milestones are only available for fixed-fee matters with milestone billing.
            </p>
          </InfoCard>
        )
      ) : null}
    </div>
  );
};
