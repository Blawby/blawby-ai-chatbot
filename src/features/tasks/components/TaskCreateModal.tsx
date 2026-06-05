import { useEffect, useMemo, useState } from 'preact/hooks';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/input/Combobox';
import { Input } from '@/shared/ui/input/Input';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type {
  CreateTaskInput,
  TaskPriority,
  TaskStatus
} from '@/features/tasks/types';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  matters: BackendMatter[];
  /** Stages already in use across the practice, used as suggestions for the stage combobox. */
  stageSuggestions: string[];
  saving: boolean;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Complete' },
  { value: 'blocked', label: 'Blocked' }
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

type FormState = {
  matterId: string;
  name: string;
  description: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  stage: string;
};

const buildInitialState = (): FormState => ({
  matterId: '',
  name: '',
  description: '',
  dueDate: '',
  status: 'pending',
  priority: 'normal',
  stage: ''
});

export const TaskCreateModal = ({
  isOpen,
  onClose,
  matters,
  stageSuggestions,
  saving,
  onSubmit
}: TaskCreateModalProps) => {
  const [formState, setFormState] = useState<FormState>(buildInitialState);
  const [errors, setErrors] = useState<{ matterId?: string; name?: string; stage?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset when the modal opens so a previous draft doesn't bleed across opens.
  useEffect(() => {
    if (isOpen) {
      setFormState(buildInitialState());
      setErrors({});
      setSubmitError(null);
    }
  }, [isOpen]);

  const matterOptions = useMemo(
    () => matters.map((matter) => ({
      value: matter.id,
      label: matter.title?.trim() || 'Untitled matter'
    })),
    [matters]
  );

  const stageOptions = useMemo(() => {
    const known = new Set(stageSuggestions.map((stage) => stage.trim()).filter(Boolean));
    const stage = formState.stage.trim();
    if (stage && !known.has(stage)) known.add(stage);
    return Array.from(known)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [stageSuggestions, formState.stage]);

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    const nextErrors: { matterId?: string; name?: string; stage?: string } = {};
    if (!formState.matterId) nextErrors.matterId = 'Pick a matter for this task.';
    if (!formState.name.trim()) nextErrors.name = 'Task name is required.';
    if (!formState.stage.trim()) nextErrors.stage = 'Stage is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    try {
      await onSubmit({
        matterId: formState.matterId,
        name: formState.name.trim(),
        description: formState.description.trim() ? formState.description : undefined,
        dueDate: formState.dueDate || null,
        status: formState.status,
        priority: formState.priority,
        stage: formState.stage.trim()
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Add task"
      contentClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <div>
            <span id="task-create-matter-label" className="mb-1 block text-sm font-medium text-ink">
              Matter
            </span>
            <Combobox
              value={formState.matterId}
              options={matterOptions}
              onChange={(value) => setFormState((prev) => ({ ...prev, matterId: value }))}
              searchable
              aria-labelledby="task-create-matter-label"
            />
            {errors.matterId ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.matterId}</p>
            ) : null}
          </div>

          <Input
            label="Task name"
            value={formState.name}
            onChange={(value) => setFormState((prev) => ({ ...prev, name: value }))}
            error={errors.name}
            required
          />

          <Textarea
            label="Description"
            value={formState.description}
            onChange={(value) => setFormState((prev) => ({ ...prev, description: value }))}
            rows={3}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="date"
              label="Due date"
              value={formState.dueDate}
              onChange={(value) => setFormState((prev) => ({ ...prev, dueDate: value }))}
            />
            <div>
              <span id="task-create-stage-label" className="mb-1 block text-sm font-medium text-ink">
                Stage
              </span>
              <Combobox
                value={formState.stage}
                options={stageOptions}
                onChange={(value) => setFormState((prev) => ({ ...prev, stage: value }))}
                searchable
                allowCustomValues
                aria-labelledby="task-create-stage-label"
              />
              {errors.stage ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.stage}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span id="task-create-status-label" className="mb-1 block text-sm font-medium text-ink">
                Status
              </span>
              <Combobox
                value={formState.status}
                options={STATUS_OPTIONS}
                onChange={(value) => setFormState((prev) => ({ ...prev, status: value as TaskStatus }))}
                searchable={false}
                aria-labelledby="task-create-status-label"
              />
            </div>
            <div>
              <span id="task-create-priority-label" className="mb-1 block text-sm font-medium text-ink">
                Priority
              </span>
              <Combobox
                value={formState.priority}
                options={PRIORITY_OPTIONS}
                onChange={(value) => setFormState((prev) => ({ ...prev, priority: value as TaskPriority }))}
                searchable={false}
                aria-labelledby="task-create-priority-label"
              />
            </div>
          </div>

          {submitError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Create task'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
