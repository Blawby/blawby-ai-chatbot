import { useMemo, useState } from 'preact/hooks';
import { PlusIcon } from '@heroicons/react/24/outline';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import type { TimeEntry } from '@/features/matters/data/matterTypes';
import { TimeEntryForm, type TimeEntryFormValues } from './TimeEntryForm';
import { formatDateOnlyStringUtc } from '@/shared/utils/dateOnly';
import { WorkDiaryCalendar } from './WorkDiaryCalendar';

const buildDateString = (date: Date) => formatDateOnlyStringUtc(date);

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


const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')} hrs`;
};

interface TimeEntriesPanelProps {
  entries: TimeEntry[];
  onSaveEntry: (values: TimeEntryFormValues, existing?: TimeEntry | null) => void;
  onDeleteEntry: (entry: TimeEntry) => void;
  loading?: boolean;
  error?: string | null;
}

export const TimeEntriesPanel = ({
  entries,
  onSaveEntry,
  onDeleteEntry,
  loading = false,
  error = null
}: TimeEntriesPanelProps) => {
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [isDateLocked, setIsDateLocked] = useState(false);
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

  const _weekEntries = useMemo(() => {
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
    setIsDateLocked(Boolean(dateKey));
    setIsFormOpen(true);
  };


  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEntry(null);
    setDraftDate(null);
  };

  const handleSave = (values: TimeEntryFormValues) => {
    onSaveEntry(values, editingEntry);
    closeForm();
  };

  const confirmDelete = (entry: TimeEntry) => {
    setDeleteTarget(entry);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    onDeleteEntry(deleteTarget);
    setDeleteTarget(null);
    if (editingEntry?.id === deleteTarget.id) {
      closeForm();
    }
  };

  const showEntries = !error && !(loading && entries.length === 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <WorkDiaryCalendar
          selectedWeekStart={selectedWeekStart}
          onSelectWeek={(date) => setSelectedWeekStart(getStartOfWeek(date))}
        />
        <div className="glass-panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-glass/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="min-w-[220px] text-center">
                <p className="text-sm font-semibold text-input-text">{weekRangeLabel}</p>
              </div>
            </div>
            <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={() => openNewEntry()}>
              Add time entry
            </Button>
          </header>

          <div className="divide-y divide-gray-200 dark:divide-white/10">
            {error ? (
              <div className="px-6 py-6 text-sm text-red-600 dark:text-red-400">{error}</div>
            ) : loading && entries.length === 0 ? (
              <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">Loading time entries...</div>
            ) : null}
            {showEntries && dailyEntries.map((day) => (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => openNewEntry(day.dateKey)}
                className="w-full text-left px-4 py-3 sm:px-6 hover:bg-white/[0.04] transition-colors"
              >
                <div className="grid gap-2 sm:grid-cols-12 sm:items-center">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-300 sm:col-span-3">
                    {formatDateLabel(day.date)}
                  </div>
                  <div className="sm:col-span-9">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-line-glass/60">
                        <div
                          className="h-2 rounded-full bg-accent-500"
                          style={{ width: `${day.progressPercentage}%` }}
                        />
                      </div>
                      <div className="text-sm font-semibold text-input-text min-w-[96px] text-right">
                        {formatDuration(day.totalSeconds)}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {day.entries.length === 1 ? '1 entry' : `${day.entries.length} entries`}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
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
            lockDate={isDateLocked}
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
              <Button variant="danger" onClick={handleDelete}>
                Delete time entry
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
