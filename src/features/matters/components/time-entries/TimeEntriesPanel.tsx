import { useMemo, useState } from 'preact/hooks';
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ulid } from 'ulid';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import type { MatterDetail, TimeEntry } from '@/features/matters/data/mockMatters';
import { TimeEntryForm, type TimeEntryFormValues } from './TimeEntryForm';
import { MatterTasksPanel } from '@/features/matters/components/tasks/MatterTasksPanel';

const buildDateString = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfWeek = (date: Date) => {
  const start = new Date(date);
  const dayIndex = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - dayIndex);
  start.setUTCHours(0, 0, 0, 0);
  return start;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
};

const formatDateLabel = (date: Date) => date.toLocaleDateString('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const formatTimeLabel = (date: Date) => date.toLocaleTimeString('en-US', {
  timeZone: 'UTC',
  hour: 'numeric',
  minute: '2-digit'
});

const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')} hrs`;
};

interface TimeEntriesPanelProps {
  matter: MatterDetail;
}

export const TimeEntriesPanel = ({ matter }: TimeEntriesPanelProps) => {
  const [entries, setEntries] = useState<TimeEntry[]>(() => matter.timeEntries ?? []);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index));
  }, [selectedWeekStart]);

  const weekRangeLabel = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    if (!start || !end) return '';
    const startLabel = start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    return `${startLabel} - ${endLabel}`;
  }, [weekDays]);

  const dailyEntries = useMemo(() => {
    return weekDays.map((day) => {
      const dayKey = buildDateString(day);
      const dayEntries = entries.filter((entry) => buildDateString(new Date(entry.startTime)) === dayKey);
      const totalSeconds = dayEntries.reduce((total, entry) => {
        const start = new Date(entry.startTime).getTime();
        const end = new Date(entry.endTime).getTime();
        return total + Math.max(0, Math.floor((end - start) / 1000));
      }, 0);
      const progressPercentage = Math.min((totalSeconds / (8 * 3600)) * 100, 100);
      return {
        dateKey: dayKey,
        date: day,
        entries: dayEntries,
        totalSeconds,
        progressPercentage
      };
    });
  }, [entries, weekDays]);

  const weekEntries = useMemo(() => {
    const weekStart = selectedWeekStart.getTime();
    const weekEnd = addDays(selectedWeekStart, 7).getTime();
    return entries
      .filter((entry) => {
        const start = new Date(entry.startTime).getTime();
        return start >= weekStart && start < weekEnd;
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [entries, selectedWeekStart]);

  const openNewEntry = (dateKey?: string) => {
    setEditingEntry(null);
    setDraftDate(dateKey ?? buildDateString(new Date()));
    setIsFormOpen(true);
  };

  const openEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setDraftDate(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEntry(null);
    setDraftDate(null);
  };

  const handleSave = (values: TimeEntryFormValues) => {
    if (editingEntry) {
      setEntries((prev) => prev.map((entry) => (
        entry.id === editingEntry.id
          ? { ...entry, startTime: values.startTime, endTime: values.endTime, description: values.description }
          : entry
      )));
    } else {
      const newEntry: TimeEntry = {
        id: ulid(),
        startTime: values.startTime,
        endTime: values.endTime,
        description: values.description
      };
      setEntries((prev) => [newEntry, ...prev]);
    }
    closeForm();
  };

  const confirmDelete = (entry: TimeEntry) => {
    setDeleteTarget(entry);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setEntries((prev) => prev.filter((entry) => entry.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (editingEntry?.id === deleteTarget.id) {
      closeForm();
    }
  };

  const totalWeekSeconds = useMemo(() => {
    return weekEntries.reduce((total, entry) => {
      const start = new Date(entry.startTime).getTime();
      const end = new Date(entry.endTime).getTime();
      return total + Math.max(0, Math.floor((end - start) / 1000));
    }, 0);
  }, [weekEntries]);

  return (
    <div className="space-y-6">
      <MatterTasksPanel matter={matter} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous week"
            icon={<ChevronLeftIcon className="h-4 w-4" />}
            onClick={() => setSelectedWeekStart((prev) => addDays(prev, -7))}
          />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{weekRangeLabel}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {weekEntries.length} entries · {formatDuration(totalWeekSeconds)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next week"
            icon={<ChevronRightIcon className="h-4 w-4" />}
            onClick={() => setSelectedWeekStart((prev) => addDays(prev, 7))}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedWeekStart(getStartOfWeek(new Date()))}
          >
            This week
          </Button>
        </div>
        <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => openNewEntry()}>
          Add time entry
        </Button>
      </header>

      <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg overflow-hidden">
        <div className="divide-y divide-gray-200 dark:divide-white/10">
          {dailyEntries.map((day) => (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => openNewEntry(day.dateKey)}
              className="w-full text-left px-4 py-3 sm:px-6 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="grid gap-2 sm:grid-cols-12 sm:items-center">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-300 sm:col-span-3">
                  {formatDateLabel(day.date)}
                </div>
                <div className="sm:col-span-9">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-white/10">
                      <div
                        className="h-2 rounded-full bg-accent-500"
                        style={{ width: `${day.progressPercentage}%` }}
                      />
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white min-w-[96px] text-right">
                      {formatDuration(day.totalSeconds)}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {day.entries.length} entry{day.entries.length === 1 ? '' : 'ies'}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg">
        <header className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-6 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Entries this week</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Review and edit individual time entries.
            </p>
          </div>
        </header>
        {weekEntries.length === 0 ? (
          <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
            No time entries yet for this week.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-white/10">
            {weekEntries.map((entry) => {
              const start = new Date(entry.startTime);
              const end = new Date(entry.endTime);
              const durationSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
              return (
                <li key={entry.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatDateLabel(start)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTimeLabel(start)} – {formatTimeLabel(end)} · {formatDuration(durationSeconds)}
                      </p>
                      {entry.description && (
                        <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{entry.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Edit time entry"
                        icon={<PencilIcon className="h-4 w-4" />}
                        onClick={() => openEditEntry(entry)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete time entry"
                        icon={<TrashIcon className="h-4 w-4" />}
                        onClick={() => confirmDelete(entry)}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isFormOpen && (
        <Modal
          isOpen={isFormOpen}
          onClose={closeForm}
          title={editingEntry ? 'Edit time entry' : 'Add time entry'}
          contentClassName="max-w-2xl"
        >
          <TimeEntryForm
            key={editingEntry?.id ?? `new-${draftDate ?? 'today'}`}
            initialEntry={editingEntry ?? undefined}
            initialDate={draftDate ?? undefined}
            onSubmit={handleSave}
            onCancel={closeForm}
            onDelete={editingEntry ? () => confirmDelete(editingEntry) : undefined}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Delete time entry"
          contentClassName="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this time entry? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button onClick={handleDelete}>
                Delete time entry
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
