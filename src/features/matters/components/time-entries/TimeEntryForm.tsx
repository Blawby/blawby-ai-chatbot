import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { DatePicker } from '@/shared/ui/input/DatePicker';
import { Select } from '@/shared/ui/input/Select';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { TimeEntry } from '@/features/matters/data/mockMatters';
import { formatDateOnlyStringUtc } from '@/shared/utils/dateOnly';

const buildDateString = (date: Date) => formatDateOnlyStringUtc(date);

const buildTimeString = (date: Date) => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const buildDateOptions = () => {
  const options: Array<{ value: string; label: string }> = [];
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + 30);
  end.setHours(0, 0, 0, 0);

  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    const value = buildDateString(current);
    const label = current.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    options.push({ value, label });
  }

  return options;
};

const buildInitialFormState = (initialEntry: TimeEntry | null | undefined, initialDate?: string) => {
  if (initialEntry) {
    const startDate = new Date(initialEntry.startTime);
    const endDate = new Date(initialEntry.endTime);
    return {
      date: buildDateString(startDate),
      startTime: buildTimeString(startDate),
      endTime: buildTimeString(endDate),
      description: initialEntry.description ?? ''
    };
  }

  const today = new Date();
  const dateValue = initialDate ?? buildDateString(today);

  return {
    date: dateValue,
    startTime: '09:00',
    endTime: '17:00',
    description: ''
  };
};

export type TimeEntryFormValues = {
  startTime: string;
  endTime: string;
  description: string;
};

interface TimeEntryFormProps {
  initialEntry?: TimeEntry | null;
  initialDate?: string;
  lockDate?: boolean;
  onSubmit: (values: TimeEntryFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export const TimeEntryForm = ({ initialEntry, initialDate, lockDate = false, onSubmit, onCancel, onDelete }: TimeEntryFormProps) => {
  const [formState, setFormState] = useState(() => buildInitialFormState(initialEntry, initialDate));
  const [errors, setErrors] = useState<{ endTime?: string }>({});

  const dateOptions = useMemo(() => buildDateOptions(), []);

  const handleSubmit = (event: Event) => {
    event.preventDefault();

    const [startHours, startMinutes] = formState.startTime.split(':').map(Number);
    const [endHours, endMinutes] = formState.endTime.split(':').map(Number);
    const [year, month, day] = formState.date.split('-').map(Number);
    const startDateTime = new Date(Date.UTC(year, month - 1, day, startHours, startMinutes));
    const endDateTime = new Date(Date.UTC(year, month - 1, day, endHours, endMinutes));

    if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
      setErrors({ endTime: 'Start and end times must be valid.' });
      return;
    }

    if (endDateTime <= startDateTime) {
      setErrors({ endTime: 'End time must be after start time.' });
      return;
    }

    setErrors({});
    onSubmit({
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      description: formState.description.trim()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="w-full">
          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Date</span>
          <Select
            value={formState.date}
            options={dateOptions}
            onChange={(value) => setFormState((prev) => ({ ...prev, date: value }))}
            disabled={lockDate}
            className="w-full justify-between px-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>
        <div>
          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Timezone</span>
          <div className="min-h-[44px] rounded-lg border border-line-default bg-surface-card px-3 py-2 text-sm text-gray-500 dark:text-gray-300 flex items-center">
            UTC
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DatePicker
          label="Start Time"
          value={formState.startTime}
          onChange={(value) => setFormState((prev) => ({ ...prev, startTime: value }))}
          format="time"
        />
        <DatePicker
          label="End Time"
          value={formState.endTime}
          onChange={(value) => setFormState((prev) => ({ ...prev, endTime: value }))}
          format="time"
          error={errors.endTime}
        />
      </div>

      <Textarea
        label="Description"
        value={formState.description}
        onChange={(value) => setFormState((prev) => ({ ...prev, description: value }))}
        rows={3}
      />

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {initialEntry && onDelete ? (
          <Button variant="danger" onClick={onDelete} className="mr-auto">
            Delete
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {initialEntry ? 'Update' : 'Create'} Time Entry
        </Button>
      </div>
    </form>
  );
};
