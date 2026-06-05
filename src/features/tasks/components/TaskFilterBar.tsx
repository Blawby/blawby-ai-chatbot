import { useMemo } from 'preact/hooks';
import { Seg, type SegOption } from '@/design-system/patterns';
import type {
  PriorityFilter,
  StageFilter,
  StatusFilter,
  TaskFilters
} from '@/features/tasks/types';

interface TaskFilterBarProps {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  /** All stage values that appear in the loaded task set, used to populate the stage Seg. */
  availableStages: string[];
}

const STATUS_OPTIONS: ReadonlyArray<SegOption<StatusFilter>> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Complete' },
  { value: 'blocked', label: 'Blocked' }
];

const PRIORITY_OPTIONS: ReadonlyArray<SegOption<PriorityFilter>> = [
  { value: 'all', label: 'All' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' }
];

const ALL_STAGE_OPTION: SegOption<StageFilter> = { value: 'all', label: 'All stages' };

export const TaskFilterBar = ({ value, onChange, availableStages }: TaskFilterBarProps) => {
  const stageOptions = useMemo<ReadonlyArray<SegOption<StageFilter>>>(() => {
    const ordered = [...availableStages].sort((a, b) => a.localeCompare(b));
    return [ALL_STAGE_OPTION, ...ordered.map((stage) => ({ value: stage, label: stage }))];
  }, [availableStages]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-dim-2">Status</span>
        <Seg<StatusFilter>
          value={value.status}
          options={STATUS_OPTIONS}
          onChange={(next) => onChange({ ...value, status: next })}
          ariaLabel="Filter tasks by status"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-dim-2">Priority</span>
        <Seg<PriorityFilter>
          value={value.priority}
          options={PRIORITY_OPTIONS}
          onChange={(next) => onChange({ ...value, priority: next })}
          ariaLabel="Filter tasks by priority"
        />
      </div>
      {stageOptions.length > 1 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-dim-2">Stage</span>
          <Seg<StageFilter>
            value={value.stage}
            options={stageOptions}
            onChange={(next) => onChange({ ...value, stage: next })}
            ariaLabel="Filter tasks by stage"
          />
        </div>
      ) : null}
    </div>
  );
};
