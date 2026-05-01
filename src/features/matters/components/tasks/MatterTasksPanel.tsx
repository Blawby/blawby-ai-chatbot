import { useMemo, useState } from 'preact/hooks';
import { EllipsisVerticalIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { Combobox } from '@/shared/ui/input/Combobox';
import { Input } from '@/shared/ui/input/Input';
import { ListRowSkeleton, PanelSectionHeader, PanelEmptyState, InteractiveListItem } from '@/shared/ui/layout';
import type { MatterOption, MatterTask } from '@/features/matters/data/matterTypes';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { toTaskStageOptions } from '@/features/matters/utils/matterUtils';
import { MatterTaskForm, type MatterTaskFormValues } from './MatterTaskForm';

type MatterTaskPatch = Partial<{
  name: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  status: MatterTask['status'];
  priority: MatterTask['priority'];
  stage: string;
}>;

const STATUS_OPTIONS: Array<{ value: MatterTask['status']; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' }
];

const PRIORITY_OPTIONS: Array<{ value: MatterTask['priority']; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

const STATUS_STYLES: Record<MatterTask['status'], string> = {
  pending: 'text-amber-800 bg-amber-50 ring-amber-600/20',
  in_progress: 'text-blue-800 bg-blue-50 ring-blue-600/20',
  completed: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20',
  blocked: 'text-rose-800 bg-rose-50 ring-rose-600/20'
};

interface MatterTasksPanelProps {
  tasks: MatterTask[];
  loading?: boolean;
  error?: string | null;
  assignees?: MatterOption[];
  readOnly?: boolean;
  onCreateTask?: (values: MatterTaskFormValues) => Promise<void>;
  onUpdateTask?: (task: MatterTask, patch: MatterTaskPatch) => Promise<void>;
  onDeleteTask?: (task: MatterTask) => Promise<void>;
}

const formatDate = (date: string | null) => (date ? formatDateOnlyUtc(date) : 'No due date');

export const MatterTasksPanel = ({
  tasks,
  loading = false,
  error = null,
  assignees = [],
  readOnly = false,
  onCreateTask,
  onUpdateTask,
  onDeleteTask
}: MatterTasksPanelProps) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MatterTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MatterTask | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canCreateTask = !readOnly && typeof onCreateTask === 'function';
  const canUpdateTask = !readOnly && typeof onUpdateTask === 'function';
  const canDeleteTask = !readOnly && typeof onDeleteTask === 'function';

  const stageOptions = useMemo(() => toTaskStageOptions(tasks), [tasks]);

  const handleInlinePatch = async (task: MatterTask, patch: MatterTaskPatch) => {
    if (readOnly || !onUpdateTask) return;
    setRequestError(null);
    try {
      await onUpdateTask(task, patch);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const openCreate = () => {
    if (!canCreateTask) return;
    setEditingTask(null);
    setRequestError(null);
    setIsFormOpen(true);
  };

  const openEdit = (task: MatterTask) => {
    if (!canUpdateTask) return;
    setEditingTask(task);
    setRequestError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingTask(null);
    setRequestError(null);
    setIsFormOpen(false);
  };

  const submitForm = async (values: MatterTaskFormValues) => {
    setRequestError(null);
    setIsSaving(true);
    try {
      if (editingTask) {
        const patch: MatterTaskPatch = {};
        if (editingTask.name !== values.name) patch.name = values.name;
        if ((editingTask.description ?? '') !== values.description) patch.description = values.description.trim() ? values.description : null;
        if ((editingTask.assigneeId ?? null) !== values.assigneeId) patch.assignee_id = values.assigneeId;
        if ((editingTask.dueDate ?? null) !== values.dueDate) patch.due_date = values.dueDate;
        if (editingTask.status !== values.status) patch.status = values.status;
        if (editingTask.priority !== values.priority) patch.priority = values.priority;
        if (editingTask.stage !== values.stage) patch.stage = values.stage;
        if (Object.keys(patch).length === 0) {
          closeForm();
          return;
        }
        if (!onUpdateTask) {
          throw new Error('Task editing is unavailable.');
        }
        await onUpdateTask(editingTask, patch);
      } else {
        if (!onCreateTask) {
          throw new Error('Task creation is unavailable.');
        }
        await onCreateTask(values);
      }
      closeForm();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!onDeleteTask || readOnly) return;
    setRequestError(null);
    setIsSaving(true);
    try {
      await onDeleteTask(deleteTarget);
      setDeleteTarget(null);
      if (editingTask?.id === deleteTarget.id) {
        closeForm();
      }
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to delete task');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="glass-panel">
      <PanelSectionHeader
        title="Tasks"
        subtitle={readOnly ? 'Review matter work items.' : 'Plan and track matter work items.'}
        actions={canCreateTask ? (
          <Button size="sm" icon={PlusIcon} iconClassName="h-4 w-4" onClick={openCreate}>
            Add task
          </Button>
        ) : null}
      />

      {error ? <div className="px-6 py-4 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
      {requestError ? <div className="px-6 py-4 text-sm text-red-600 dark:text-red-400">{requestError}</div> : null}

      {loading && tasks.length === 0 ? (
        <ListRowSkeleton rows={4} avatar={false} className="divide-y divide-line-default" />
      ) : tasks.length === 0 ? (
        <PanelEmptyState message="No tasks yet." />
      ) : (
        <ul className="divide-y divide-line-default">
          {tasks.map((task) => {
            const assignee = task.assigneeId ? assignees.find((candidate) => candidate.id === task.assigneeId) ?? null : null;
            const stageRowOptions = (() => {
              const known = new Set(stageOptions.map((option) => option.value));
              if (task.stage.trim() && !known.has(task.stage.trim())) {
                return [{ value: task.stage.trim(), label: task.stage.trim() }, ...stageOptions];
              }
              return stageOptions;
            })();
            return (
              <InteractiveListItem
                key={task.id}
                onClick={() => openEdit(task)}
                disabled={!canUpdateTask}
                padding="px-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-input-text">{task.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-input-placeholder">
                      <span className={[STATUS_STYLES[task.status], 'rounded-md px-2 py-0.5 font-medium ring-1 ring-inset'].join(' ')}>{task.status}</span>
                      <span>Priority: {task.priority}</span>
                      <span>Stage: {task.stage}</span>
                      <span>{formatDate(task.dueDate)}</span>
                      <span>{assignee ? `Assigned: ${assignee.name}` : 'Unassigned'}</span>
                    </div>
                    {task.description ? <p className="mt-2 text-sm text-input-placeholder">{task.description}</p> : null}
                  </div>
                  {!readOnly && (canUpdateTask || canDeleteTask) ? (
                    <div className="flex items-center gap-2">
                      {canUpdateTask ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label="Open quick edit">
                              Quick edit
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64 space-y-3 p-3">
                            <div>
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-input-placeholder">Status</span>
                              <Combobox
                                value={task.status}
                                options={STATUS_OPTIONS}
                                onChange={(value) => void handleInlinePatch(task, { status: value as MatterTask['status'] })}
                                searchable={false}
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-input-placeholder">Priority</span>
                              <Combobox
                                value={task.priority}
                                options={PRIORITY_OPTIONS}
                                onChange={(value) => void handleInlinePatch(task, { priority: value as MatterTask['priority'] })}
                                searchable={false}
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-input-placeholder">Assignee</span>
                              <Combobox
                                value={task.assigneeId ?? ''}
                                options={[{ value: '', label: 'Unassigned' }, ...assignees.map((a) => ({ value: a.id, label: a.name }))]}
                                onChange={(value) => void handleInlinePatch(task, { assignee_id: value || null })}
                                searchable
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-input-placeholder">Due date</span>
                              <Input
                                type="date"
                                value={task.dueDate ?? ''}
                                onChange={(value) => void handleInlinePatch(task, { due_date: value || null })}
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-input-placeholder">Stage</span>
                              <Combobox
                                value={task.stage}
                                options={stageRowOptions}
                                onChange={(value) => void handleInlinePatch(task, { stage: value.trim() })}
                                allowCustomValues
                                searchable
                              />
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Open task actions"
                            icon={EllipsisVerticalIcon} iconClassName="h-4 w-4"
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <div className="py-1">
                            {canUpdateTask ? (
                              <DropdownMenuItem onSelect={() => openEdit(task)}>
                                <span className="flex items-center gap-2">
                                  <Icon icon={PencilIcon} className="h-4 w-4"  />
                                  Edit
                                </span>
                              </DropdownMenuItem>
                            ) : null}
                            {canDeleteTask ? (
                              <DropdownMenuItem onSelect={() => setDeleteTarget(task)}>
                                <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                  <Icon icon={TrashIcon} className="h-4 w-4"  />
                                  Delete
                                </span>
                              </DropdownMenuItem>
                            ) : null}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
              </InteractiveListItem>
            );
          })}
        </ul>
      )}

      {!readOnly && isFormOpen ? (
        <Dialog
          isOpen={isFormOpen}
          onClose={closeForm}
          title={editingTask ? 'Edit task' : 'Add task'}
          contentClassName="max-w-2xl"
        >
          <DialogBody>
            <MatterTaskForm
              key={editingTask?.id ?? 'new-task'}
              initialTask={editingTask}
              assignees={assignees}
              stageOptions={stageOptions}
              saving={isSaving}
              error={requestError}
              onSubmit={submitForm}
              onCancel={closeForm}
              onDelete={editingTask && canDeleteTask ? async () => {
                setDeleteTarget(editingTask);
                setIsFormOpen(false);
              } : undefined}
            />
          </DialogBody>
        </Dialog>
      ) : null}

      {canDeleteTask && deleteTarget ? (
        <Dialog
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Delete task"
          contentClassName="max-w-xl"
        >
          <DialogBody className="space-y-4">
            <p className="text-sm text-input-text opacity-80">
              Are you sure you want to delete this task? This action cannot be undone.
            </p>
            {requestError ? <p className="text-sm text-red-600 dark:text-red-400">{requestError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={isSaving}>
              {isSaving ? 'Deleting...' : 'Delete task'}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}

    </section>
  );
};
