import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/input/Combobox';
import { Input } from '@/shared/ui/input/Input';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { MatterOption, MatterTask } from '@/features/matters/data/matterTypes';

export type MatterTaskFormValues = {
  name: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  status: MatterTask['status'];
  priority: MatterTask['priority'];
  stage: string;
};

type MatterTaskFormState = {
  name: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  status: MatterTask['status'];
  priority: MatterTask['priority'];
  stage: string;
};

const buildInitialFormState = (initialTask?: MatterTask | null): MatterTaskFormState => ({
  name: initialTask?.name ?? '',
  description: initialTask?.description ?? '',
  assigneeId: initialTask?.assigneeId ?? '',
  dueDate: initialTask?.dueDate ?? '',
  status: initialTask?.status ?? 'pending',
  priority: initialTask?.priority ?? 'normal',
  stage: initialTask?.stage ?? ''
});

interface MatterTaskFormProps {
  initialTask?: MatterTask | null;
  assignees?: MatterOption[];
  stageOptions?: Array<{ value: string; label: string }>;
  saving?: boolean;
  error?: string | null;
  onSubmit: (values: MatterTaskFormValues) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void | Promise<void>;
}

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

export const MatterTaskForm = ({
  initialTask,
  assignees = [],
  stageOptions = [],
  saving = false,
  error = null,
  onSubmit,
  onCancel,
  onDelete
}: MatterTaskFormProps) => {
  const [formState, setFormState] = useState<MatterTaskFormState>(() => buildInitialFormState(initialTask));
  const [errors, setErrors] = useState<{ name?: string; stage?: string }>({});

  const assigneeOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name }))
    ],
    [assignees]
  );

  const mergedStageOptions = useMemo(() => {
    const known = new Set(stageOptions.map((option) => option.value));
    const options = [...stageOptions];
    const stage = formState.stage.trim();
    if (stage && !known.has(stage)) {
      options.unshift({ value: stage, label: stage });
    }
    return options;
  }, [formState.stage, stageOptions]);

  const handleSubmit = (event: Event) => {
    event.preventDefault();

    const nextErrors: { name?: string; stage?: string } = {};
    if (!formState.name.trim()) nextErrors.name = 'Name is required.';
    if (!formState.stage.trim()) nextErrors.stage = 'Stage is required.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      name: formState.name.trim(),
      description: formState.description,
      assigneeId: formState.assigneeId || null,
      dueDate: formState.dueDate || null,
      status: formState.status,
      priority: formState.priority,
      stage: formState.stage.trim()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        rows={4}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="date"
          label="Due date"
          value={formState.dueDate}
          onChange={(value) => setFormState((prev) => ({ ...prev, dueDate: value }))}
        />
        <div>
          <span id="matter-task-assignee-label" className="mb-1 block text-sm font-medium text-input-text">
            Assignee
          </span>
          <Combobox
            value={formState.assigneeId}
            options={assigneeOptions}
            onChange={(value) => setFormState((prev) => ({ ...prev, assigneeId: value }))}
            searchable
            direction="up"
            aria-labelledby="matter-task-assignee-label"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span id="matter-task-status-label" className="mb-1 block text-sm font-medium text-input-text">
            Status
          </span>
          <Combobox
            value={formState.status}
            options={STATUS_OPTIONS}
            onChange={(value) => setFormState((prev) => ({ ...prev, status: value as MatterTask['status'] }))}
            searchable={false}
            direction="up"
            aria-labelledby="matter-task-status-label"
          />
        </div>
        <div>
          <span id="matter-task-priority-label" className="mb-1 block text-sm font-medium text-input-text">
            Priority
          </span>
          <Combobox
            value={formState.priority}
            options={PRIORITY_OPTIONS}
            onChange={(value) => setFormState((prev) => ({ ...prev, priority: value as MatterTask['priority'] }))}
            searchable={false}
            direction="up"
            aria-labelledby="matter-task-priority-label"
          />
        </div>
      </div>

      <div>
        <span id="matter-task-stage-label" className="mb-1 block text-sm font-medium text-input-text">
          Stage
        </span>
        <Combobox
          value={formState.stage}
          options={mergedStageOptions}
          onChange={(value) => setFormState((prev) => ({ ...prev, stage: value }))}
          allowCustomValues
          searchable
          direction="up"
          aria-labelledby="matter-task-stage-label"
        />
        {errors.stage ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.stage}</p> : null}
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {initialTask && onDelete ? (
          <Button variant="danger" onClick={onDelete} className="mr-auto" disabled={saving}>
            Delete
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : initialTask ? 'Update Task' : 'Create Task'}
        </Button>
      </div>
    </form>
  );
};
