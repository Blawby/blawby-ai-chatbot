import { useMemo, useState } from 'preact/hooks';
import { CheckSquare, Plus } from 'lucide-preact';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { EntityList } from '@/shared/ui/list/EntityList';
import { AISummary } from '@/design-system/patterns';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTasks } from '@/features/tasks/services/useTasks';
import { TaskFilterBar } from '@/features/tasks/components/TaskFilterBar';
import { TaskListItem } from '@/features/tasks/components/TaskListItem';
import { TaskCreateModal } from '@/features/tasks/components/TaskCreateModal';
import type {
  CreateTaskInput,
  Task,
  TaskFilters,
  TaskPriority,
  TaskStatus
} from '@/features/tasks/types';

interface PracticeTasksPageProps {
  practiceId: string | null;
  /** Base path for the practice workspace (e.g. `/practice/acme`). Used to deep-link matters. */
  basePath?: string;
  /** Optional navigation hook for matter chip clicks. */
  onNavigate?: (path: string) => void;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

const taskDueTime = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Sort tasks: priority desc (urgent → low), then due date asc
 * (overdue first, then nearest due, then no-date last).
 */
const sortTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    const aDue = taskDueTime(a.dueDate);
    const bDue = taskDueTime(b.dueDate);
    if (aDue === null && bDue === null) {
      return a.name.localeCompare(b.name);
    }
    if (aDue === null) return 1; // no due date last
    if (bDue === null) return -1;
    return aDue - bDue;
  });

const filterTasks = (tasks: Task[], filters: TaskFilters): Task[] =>
  tasks.filter((task) => {
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (filters.stage !== 'all' && task.stage !== filters.stage) return false;
    return true;
  });

export const PracticeTasksPage = ({
  practiceId,
  basePath,
  onNavigate
}: PracticeTasksPageProps) => {
  const { showError } = useToastContext();
  const {
    tasks,
    matters,
    isLoading,
    isMutating,
    error,
    createTask,
    updateTask,
    deleteTask
  } = useTasks(practiceId);

  const [filters, setFilters] = useState<TaskFilters>({
    status: 'all',
    priority: 'all',
    stage: 'all'
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const availableStages = useMemo(() => {
    const stages = new Set<string>();
    for (const task of tasks) {
      const stage = task.stage?.trim();
      if (stage) stages.add(stage);
    }
    return Array.from(stages);
  }, [tasks]);

  const sortedFilteredTasks = useMemo(
    () => sortTasks(filterTasks(tasks, filters)),
    [tasks, filters]
  );

  const openCount = useMemo(
    () => tasks.filter((task) => task.status !== 'completed').length,
    [tasks]
  );
  const urgentCount = useMemo(
    () => tasks.filter((task) => task.priority === 'urgent' && task.status !== 'completed').length,
    [tasks]
  );
  const overdueCount = useMemo(() => {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const today = todayStart.getTime();
    return tasks.filter((task) => {
      if (task.status === 'completed') return false;
      const due = taskDueTime(task.dueDate);
      return due !== null && due < today;
    }).length;
  }, [tasks]);

  const aiPick = useMemo(() => {
    const open = tasks.filter((task) => task.status !== 'completed');
    if (open.length === 0) return null;
    return sortTasks(open)[0] ?? null;
  }, [tasks]);

  const handleNavigateToMatter = (matterId: string) => {
    if (!basePath) return;
    onNavigate?.(`${basePath}/matters/${encodeURIComponent(matterId)}`);
  };

  const handleCreateTask = async (input: CreateTaskInput) => {
    try {
      await createTask(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create task';
      showError('Could not create task', message);
      throw err;
    }
  };

  const handleToggleComplete = async (task: Task, next: TaskStatus) => {
    try {
      await updateTask(task, { status: next });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update task';
      showError('Could not update task', message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deleteTask(target);
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      showError('Could not delete task', message);
    }
  };

  if (!practiceId) {
    return (
      <Page className="h-full">
        <WorkspacePlaceholderState
          icon={CheckSquare}
          title="Tasks unavailable"
          description="Open this workspace from a practice to view tasks."
          className="p-8"
        />
      </Page>
    );
  }

  // Mobile reflow strategy:
  // - PageHeader: title 28px (token-driven); crumb/lede stack on mobile
  // - Add task CTA: stays inline in PageHeader's actions slot (auto-wraps)
  // - AISummary card: full-width, naturally wraps long lede
  // - TaskFilterBar: 3 Segs (Status / Priority / Stage). On mobile they wrap
  //   onto separate rows; each Seg gets horizontal scroll for long options
  // - EntityList of TaskListItem: each item already stacks pills + title
  //   responsively, with truncate-safe text and right-aligned due-date column
  return (
    <Page className="h-full">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6">
        <PageHeader
          crumb={`${openCount} open · ${urgentCount} urgent · ${overdueCount} overdue`}
          title="Tasks"
          subtitle="Cross-matter task queue. Sorted by priority, then due date."
          actions={(
            <Button
              size="sm"
              icon={Plus}
              iconClassName="h-4 w-4"
              onClick={() => setIsCreateOpen(true)}
              disabled={matters.length === 0}
              className="min-h-[44px] sm:min-h-0"
            >
              Add task
            </Button>
          )}
        />

        {aiPick ? (
          <AISummary label="If you do one thing today" verifier={`grounded in ${tasks.length} tasks`}>
            Start with <em>{aiPick.name}</em> on <em>{aiPick.matterTitle}</em>
            {aiPick.dueDate ? ` — due ${aiPick.dueDate}` : ''}.
            {' '}It is the highest-priority open task and ranks first by due date.
          </AISummary>
        ) : null}

        <TaskFilterBar
          value={filters}
          onChange={setFilters}
          availableStages={availableStages}
        />

        {error ? (
          <div className="status-error rounded-2xl px-4 py-3 text-sm">{error}</div>
        ) : null}

        <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <EntityList<Task>
            items={sortedFilteredTasks}
            isLoading={isLoading}
            onSelect={(task) => handleNavigateToMatter(task.matterId)}
            renderItem={(task) => (
              <TaskListItem
                task={task}
                onOpenMatter={basePath ? handleNavigateToMatter : undefined}
                onToggleComplete={(t, next) => { void handleToggleComplete(t, next); }}
                onDelete={(t) => setDeleteTarget(t)}
                disabled={isMutating}
              />
            )}
            emptyState={(
              <WorkspacePlaceholderState
                icon={CheckSquare}
                title={tasks.length === 0 ? 'No tasks yet' : 'No tasks match these filters'}
                description={tasks.length === 0
                  ? 'Create a task on any matter to populate this queue.'
                  : 'Clear or adjust the filters above to see more.'}
                primaryAction={tasks.length === 0 && matters.length > 0 ? {
                  label: 'Add task',
                  onClick: () => setIsCreateOpen(true),
                  icon: Plus
                } : undefined}
                className="p-8"
              />
            )}
          />
        </section>

        <TaskCreateModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          matters={matters}
          stageSuggestions={availableStages}
          saving={isMutating}
          onSubmit={handleCreateTask}
        />

        {deleteTarget ? (
          <Dialog
            isOpen={Boolean(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
            title="Delete task"
            contentClassName="max-w-xl"
          >
            <DialogBody className="space-y-3">
              <p className="text-sm text-ink-2">
                Delete <span className="font-semibold text-ink">{deleteTarget.name}</span>?
                This action cannot be undone.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isMutating}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleConfirmDelete()} disabled={isMutating}>
                {isMutating ? 'Deleting...' : 'Delete task'}
              </Button>
            </DialogFooter>
          </Dialog>
        ) : null}
      </div>
    </Page>
  );
};

export default PracticeTasksPage;
