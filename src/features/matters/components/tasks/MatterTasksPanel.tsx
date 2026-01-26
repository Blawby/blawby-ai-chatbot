import { useState } from 'preact/hooks';
import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ulid } from 'ulid';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import type { MatterDetail, MatterTask } from '@/features/matters/data/mockMatters';
import { MatterTaskForm, type MatterTaskFormValues } from './MatterTaskForm';

const STATUS_STYLES: Record<MatterTask['status'], string> = {
  pending: 'text-amber-800 bg-amber-50 ring-amber-600/20',
  completed: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20'
};

const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

interface MatterTasksPanelProps {
  matter: MatterDetail;
}

export const MatterTasksPanel = ({ matter }: MatterTasksPanelProps) => {
  const [tasks, setTasks] = useState<MatterTask[]>(() => matter.tasks ?? []);
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

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg">
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tasks</h3>
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
        <ul className="divide-y divide-gray-200 dark:divide-white/10">
          {tasks.map((task) => (
            <li key={task.id} className="px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold leading-6 text-gray-900 dark:text-white">
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
                  </div>
                  {task.description && (
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit task"
                    icon={<PencilIcon className="h-4 w-4" />}
                    onClick={() => openEditTask(task)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete task"
                    icon={<TrashIcon className="h-4 w-4" />}
                    onClick={() => confirmDelete(task)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
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
              <Button onClick={handleDelete}>
                Delete task
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};
