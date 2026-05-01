import { useMemo, useState } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { Button } from '@/shared/ui/Button';
import { DatePicker } from '@/shared/ui/input/DatePicker';
import { Combobox } from '@/shared/ui/input/Combobox';
import { Textarea } from '@/shared/ui/input/Textarea';
import { Checkbox } from '@/shared/ui/input/Checkbox';
import type { TimeEntry } from '@/features/matters/data/matterTypes';
import { formatDateOnlyStringUtc } from '@/shared/utils/dateOnly';

const buildDateString = (date: Date) => formatDateOnlyStringUtc(date);

const buildTimeString = (date: Date) => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const buildDateOptions = () => {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30));

  for (let current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    const value = buildDateString(current);
    const label = current.toLocaleDateString('en-US', {
      timeZone: 'UTC',
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
      description: initialEntry.description ?? '',
      billable: initialEntry.billable ?? true
    };
  }

  const today = new Date();
  const dateValue = initialDate ?? buildDateString(today);

  return {
    date: dateValue,
    startTime: '09:00',
    endTime: '17:00',
    description: '',
    billable: true
  };
};

export type TimeEntryFormValues = {
  startTime: string;
  endTime: string;
  description: string;
  billable: boolean;
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
  const initial = useMemo(() => buildInitialFormState(initialEntry, initialDate), [initialEntry, initialDate]);

  const date = useSignal(initial.date);
  const startTime = useSignal(initial.startTime);
  const endTime = useSignal(initial.endTime);
  const description = useSignal(initial.description);
  const billable = useSignal(initial.billable);
  const [endTimeError, setEndTimeError] = useState<string | undefined>();

  const dateOptions = useMemo(() => buildDateOptions(), []);

  const handleSubmit = (event: Event) => {
    event.preventDefault();

    const [startHours, startMinutes] = startTime.value.split(':').map(Number);
    const [endHours, endMinutes] = endTime.value.split(':').map(Number);
    const [year, month, day] = date.value.split('-').map(Number);
    const startDateTime = new Date(Date.UTC(year, month - 1, day, startHours, startMinutes));
    const endDateTime = new Date(Date.UTC(year, month - 1, day, endHours, endMinutes));

    if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
      setEndTimeError('Start and end times must be valid.');
      return;
    }

    if (endDateTime <= startDateTime) {
      setEndTimeError('End time must be after start time.');
      return;
    }

    setEndTimeError(undefined);
    onSubmit({
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      description: description.value.trim(),
      billable: billable.value,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="w-full">
          <span className="block text-sm font-medium text-input-text mb-1">Date</span>
          <Combobox
            value={date.value}
            options={dateOptions}
            onChange={(value) => { date.value = value; }}
            disabled={lockDate}
            className="w-full justify-between px-3 py-2 text-sm rounded-xl border border-input-border bg-input-bg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>
        <div>
          <span className="block text-sm font-medium text-input-text mb-1">Timezone</span>
          <div className="glass-input rounded-xl px-3 py-2.5 text-sm text-input-placeholder flex items-center">
            UTC
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DatePicker
          label="Start Time"
          value={startTime.value}
          onChange={(value) => { startTime.value = value; }}
          format="time"
        />
        <DatePicker
          label="End Time"
          value={endTime.value}
          onChange={(value) => { endTime.value = value; }}
          format="time"
          error={endTimeError}
        />
      </div>

      <Textarea
        label="Description"
        value={description.value}
        onChange={(value) => { description.value = value; }}
        rows={3}
      />

      <Checkbox
        checked={billable.value}
        onChange={(checked) => { billable.value = checked; }}
        label="Billable"
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
