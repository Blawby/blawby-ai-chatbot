import { useMemo, useState } from 'preact/hooks';
import { EllipsisVerticalIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ulid } from 'ulid';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import type { MatterDetail, MatterTask } from '@/features/matters/data/mockMatters';
import { mockAssignees } from '@/features/matters/data/mockMatters';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { MatterTaskForm, type MatterTaskFormValues } from './MatterTaskForm';
import { Avatar } from '@/shared/ui/profile';

const STATUS_STYLES: Record<MatterTask['status'], string> = {
  pending: 'text-amber-800 bg-amber-50 ring-amber-600/20',
  completed: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20'
};

const formatDate = (dateString?: string) => (dateString ? formatDateOnlyUtc(dateString) : '');

type MatterTaskWithAssignee = MatterTask & { assigneeId?: string | null };

interface MatterTasksPanelProps {
  matter: MatterDetail;
}

export const MatterTasksPanel = ({ matter }: MatterTasksPanelProps) => {
  const [tasks, setTasks] = useState<MatterTaskWithAssignee[]>(() => matter.tasks ?? []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MatterTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MatterTask | null>(null);

  const openNewTask = () => {
    setEditingTask(null);
    setIsFormOpen(true);
  };

  const openEditTask = (task: MatterTask) => {
    setEditingTask(task);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingTask(null);
  };

  const handleSave = (values: MatterTaskFormValues) => {
    if (editingTask) {
      setTasks((prev) => prev.map((task) => (
        task.id === editingTask.id
          ? { ...task, ...values }
          : task
      )));
    } else {
      const newTask: MatterTask = {
        id: ulid(),
        ...values
      };
      setTasks((prev) => [newTask, ...prev]);
    }
    closeForm();
  };

  const confirmDelete = (task: MatterTask) => {
    setDeleteTarget(task);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setTasks((prev) => prev.filter((task) => task.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (editingTask?.id === deleteTarget.id) {
      closeForm();
    }
  };

  const handleAssign = (taskId: string, assigneeId: string | null) => {
    setTasks((prev) => prev.map((task) => (
      task.id === taskId ? { ...task, assigneeId } : task
    )));
  };

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== 'completed'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === 'completed'), [tasks]);

  return (
    <section className="glass-panel">
      <header className="flex items-center justify-between border-b border-line-glass/30 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-input-text">Tasks</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Manage milestones and to-dos for this matter.
          </p>
        </div>
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={openNewTask}>
          Add task
        </Button>
      </header>

      {tasks.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          No tasks yet. Add a task to track milestone progress.
        </div>
      ) : (
        <div className="divide-y divide-line-default">
          {activeTasks.map((task) => {
            const assignee = task.assigneeId
              ? mockAssignees.find((candidate) => candidate.id === task.assigneeId) ?? null
              : null;
            return (
              <div
                key={task.id}
                className="px-6 py-5 hover:bg-surface-glass/50 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <button
                    type="button"
                    className="min-w-0 text-left flex-1"
                    onClick={() => openEditTask(task)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm font-semibold leading-6 text-input-text">
                          {task.title}
                        </p>
                        <span
                          className={[
                            STATUS_STYLES[task.status],
                            'mt-0.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset'
                          ].join(' ')}
                        >
                          {task.status}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        {task.dueDate && (
                          <p>
                            Due on <time dateTime={task.dueDate}>{formatDate(task.dueDate)}</time>
                          </p>
                        )}
                        {typeof task.timeEstimateHours === 'number' && (
                          <p>Time estimate: {task.timeEstimateHours} hours</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <span>Assigned:</span>
                          {assignee ? (
                            <span className="inline-flex items-center gap-2 rounded-full border border-line-glass/30 px-2 py-0.5 text-xs text-input-text">
                              <Avatar name={assignee.name} size="xs" className="bg-surface-glass/60" />
                              {assignee.name}
                            </span>
                          ) : (
                            <span className="text-gray-400">Unassigned</span>
                          )}
                        </div>
                      </div>
                      {task.description && (
                        <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Assign task"
                          icon={<PlusIcon className="h-4 w-4" />}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <div className="py-1">
                          <DropdownMenuItem onSelect={() => handleAssign(task.id, null)}>
                            Unassigned
                          </DropdownMenuItem>
                          {mockAssignees.map((assigneeOption) => (
                            <DropdownMenuItem
                              key={assigneeOption.id}
                              onSelect={() => handleAssign(task.id, assigneeOption.id)}
                            >
                              <span className="flex items-center gap-2">
                                <Avatar name={assigneeOption.name} size="xs" className="bg-surface-glass/60" />
                                {assigneeOption.name}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Open task actions"
                          icon={<EllipsisVerticalIcon className="h-4 w-4" />}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <div className="py-1">
                          <DropdownMenuItem onSelect={() => openEditTask(task)}>
                            <span className="flex items-center gap-2">
                              <PencilIcon className="h-4 w-4" />
                              Edit
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => confirmDelete(task)}>
                            <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                              <TrashIcon className="h-4 w-4" />
                              Delete
                            </span>
                          </DropdownMenuItem>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}

          {completedTasks.length > 0 && (
            <div className="border-t border-line-glass/30">
              <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Completed
              </div>
              {completedTasks.map((task) => {
                const assignee = task.assigneeId
                  ? mockAssignees.find((candidate) => candidate.id === task.assigneeId) ?? null
                  : null;
                return (
                  <div
                    key={task.id}
                    className="px-6 py-5 opacity-60 hover:opacity-80 hover:bg-surface-glass/50 transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <button
                        type="button"
                        className="min-w-0 text-left flex-1"
                        onClick={() => openEditTask(task)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm font-semibold leading-6 text-input-text line-through">
                              {task.title}
                            </p>
                            <span
                              className={[
                                STATUS_STYLES[task.status],
                                'mt-0.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset'
                              ].join(' ')}
                            >
                              {task.status}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                            {task.dueDate && (
                              <p>
                                Due on <time dateTime={task.dueDate}>{formatDate(task.dueDate)}</time>
                              </p>
                            )}
                            {typeof task.timeEstimateHours === 'number' && (
                              <p>Time estimate: {task.timeEstimateHours} hours</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <span>Assigned:</span>
                              {assignee ? (
                                <span className="inline-flex items-center gap-2 rounded-full border border-line-glass/30 px-2 py-0.5 text-xs text-input-text">
                                  <Avatar name={assignee.name} size="xs" className="bg-surface-glass/60" />
                                  {assignee.name}
                                </span>
                              ) : (
                                <span className="text-gray-400">Unassigned</span>
                              )}
                            </div>
                          </div>
                          {task.description && (
                            <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Assign task"
                              icon={<PlusIcon className="h-4 w-4" />}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <div className="py-1">
                              <DropdownMenuItem onSelect={() => handleAssign(task.id, null)}>
                                Unassigned
                              </DropdownMenuItem>
                              {mockAssignees.map((assigneeOption) => (
                                <DropdownMenuItem
                                  key={assigneeOption.id}
                                  onSelect={() => handleAssign(task.id, assigneeOption.id)}
                                >
                                  <span className="flex items-center gap-2">
                                    <Avatar name={assigneeOption.name} size="xs" className="bg-surface-glass/60" />
                                    {assigneeOption.name}
                                  </span>
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Open task actions"
                              icon={<EllipsisVerticalIcon className="h-4 w-4" />}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            <div className="py-1">
                              <DropdownMenuItem onSelect={() => openEditTask(task)}>
                                <span className="flex items-center gap-2">
                                  <PencilIcon className="h-4 w-4" />
                                  Edit
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => confirmDelete(task)}>
                                <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                  <TrashIcon className="h-4 w-4" />
                                  Delete
                                </span>
                              </DropdownMenuItem>
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isFormOpen && (
        <Modal
          isOpen={isFormOpen}
          onClose={closeForm}
          title={editingTask ? 'Edit task' : 'Add task'}
          contentClassName="max-w-2xl"
        >
          <MatterTaskForm
            key={editingTask?.id ?? 'new-task'}
            initialTask={editingTask ?? undefined}
            onSubmit={handleSave}
            onCancel={closeForm}
            onDelete={editingTask ? () => confirmDelete(editingTask) : undefined}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Delete task"
          contentClassName="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this task? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete task
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};
