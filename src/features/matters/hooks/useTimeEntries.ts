import { useCallback, useEffect, useState } from 'preact/hooks';
import { ulid } from 'ulid';
import type { TimeEntry } from '@/features/matters/data/matterTypes';
import type { TimeEntryFormValues } from '@/features/matters/components/time-entries/TimeEntryForm';

type UseTimeEntriesOptions = {
  initialEntries?: TimeEntry[];
  resetKey?: string;
};

export const useTimeEntries = ({ initialEntries = [], resetKey }: UseTimeEntriesOptions) => {
  const [entries, setEntries] = useState<TimeEntry[]>(() => initialEntries);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries, resetKey]);

  const saveEntry = useCallback((values: TimeEntryFormValues, existing?: TimeEntry | null) => {
    setEntries((prev) => {
      if (existing) {
        return prev.map((entry) => (
          entry.id === existing.id
            ? { ...entry, startTime: values.startTime, endTime: values.endTime, description: values.description }
            : entry
        ));
      }
      const newEntry: TimeEntry = {
        id: ulid(),
        startTime: values.startTime,
        endTime: values.endTime,
        description: values.description
      };
      return [newEntry, ...prev];
    });
  }, []);

  const deleteEntry = useCallback((entry: TimeEntry) => {
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
  }, []);

  return {
    entries,
    saveEntry,
    deleteEntry,
    setEntries
  };
};
