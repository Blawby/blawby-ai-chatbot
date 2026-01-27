import { useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { DatePicker, Input, NumberInput, Select, Textarea } from '@/shared/ui/input';
import type { MatterTask } from '@/features/matters/data/mockMatters';

const buildDateString = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type MatterTaskFormState = {
  title: string;
  description: string;
  dueDate: string;
  status: MatterTask['status'];
  timeEstimateHours?: number;
};

const buildInitialFormState = (initialTask?: MatterTask | null): MatterTaskFormState => ({
  title: initialTask?.title ?? '',
  description: initialTask?.description ?? '',
  dueDate: initialTask?.dueDate ?? buildDateString(new Date()),
  status: initialTask?.status ?? 'pending',
  timeEstimateHours: initialTask?.timeEstimateHours
});

export type MatterTaskFormValues = {
  title: string;
  description: string;
  dueDate: string;
  status: MatterTask['status'];
  timeEstimateHours?: number;
};

interface MatterTaskFormProps {
  initialTask?: MatterTask | null;
  onSubmit: (values: MatterTaskFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' }
];

export const MatterTaskForm = ({ initialTask, onSubmit, onCancel, onDelete }: MatterTaskFormProps) => {
  const [formState, setFormState] = useState<MatterTaskFormState>(() => buildInitialFormState(initialTask));
  const [errors, setErrors] = useState<{ title?: string }>({});

  const handleSubmit = (event: Event) => {
    event.preventDefault();

    if (!formState.title.trim()) {
      setErrors({ title: 'Title is required.' });
      return;
    }

    setErrors({});
    onSubmit({
      title: formState.title.trim(),
      description: formState.description.trim(),
      dueDate: formState.dueDate,
      status: formState.status as MatterTask['status'],
      timeEstimateHours: formState.timeEstimateHours
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Title"
        value={formState.title}
        onChange={(value) => setFormState((prev) => ({ ...prev, title: value }))}
        error={errors.title}
        required
      />

      <Textarea
        label="Description"
        value={formState.description}
        onChange={(value) => setFormState((prev) => ({ ...prev, description: value }))}
        rows={3}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DatePicker
          label="Due date"
          value={formState.dueDate}
          onChange={(value) => setFormState((prev) => ({ ...prev, dueDate: value }))}
          format="date"
        />
        <Select
          label="Status"
          value={formState.status}
          options={STATUS_OPTIONS}
          onChange={(value) => setFormState((prev) => ({ ...prev, status: value as MatterTask['status'] }))}
        />
      </div>

      <NumberInput
        label="Time estimate (hours)"
        value={formState.timeEstimateHours}
        onChange={(value) => setFormState((prev) => ({ ...prev, timeEstimateHours: value }))}
        min={0}
        step={0.5}
        precision={1}
        showControls={false}
        placeholder="e.g. 3.5"
      />

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {initialTask && onDelete ? (
          <Button variant="secondary" size="sm" onClick={onDelete} className="mr-auto">
            Delete
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {initialTask ? 'Update' : 'Create'} Task
        </Button>
      </div>
    </form>
  );
};
