import { useMemo } from 'preact/hooks';
import { Check, MoreVertical, Trash2 } from 'lucide-preact';
import { MatterChip } from '@/design-system/patterns';
import { Pill, type PillTone } from '@/design-system/primitives/Pill';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { Icon } from '@/shared/ui/Icon';
import { formatDateOnlyUtc, parseDateOnlyUtc } from '@/shared/utils/dateOnly';
import type { Task, TaskPriority, TaskStatus } from '@/features/tasks/types';

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Complete',
  blocked: 'Blocked'
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent'
};

/**
 * Status -> Pill tone:
 *   blocked   -> urgent (--neg)
 *   completed -> live   (--pos)
 *   in_progress -> gold (--accent)
 *   pending   -> dim    (no tone)
 */
const STATUS_TONE: Record<TaskStatus, PillTone | undefined> = {
  blocked: 'urgent',
  completed: 'live',
  in_progress: 'gold',
  pending: 'dim'
};

/**
 * Priority -> Pill tone:
 *   urgent -> urgent (--neg)
 *   high   -> warn   (--warn)
 *   normal -> dim
 *   low    -> dim
 */
const PRIORITY_TONE: Record<TaskPriority, PillTone | undefined> = {
  urgent: 'urgent',
  high: 'warn',
  normal: 'dim',
  low: 'dim'
};

const formatDueDate = (raw: string | null): { label: string; overdue: boolean } | null => {
  if (!raw) return null;
  const parsed = parseDateOnlyUtc(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const overdue = parsed.getTime() < today.getTime();
  return {
    label: formatDateOnlyUtc(raw, 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    overdue
  };
};

interface TaskListItemProps {
  task: Task;
  onOpenMatter?: (matterId: string) => void;
  /** Toggle completion (or reopen). Fires before the parent mutation resolves. */
  onToggleComplete?: (task: Task, next: TaskStatus) => void;
  onDelete?: (task: Task) => void;
  disabled?: boolean;
}

export const TaskListItem = ({
  task,
  onOpenMatter,
  onToggleComplete,
  onDelete,
  disabled = false
}: TaskListItemProps) => {
  const due = useMemo(() => formatDueDate(task.dueDate), [task.dueDate]);
  const isComplete = task.status === 'completed';

  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      <div className="flex items-start gap-3">
        {onToggleComplete ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleComplete(task, isComplete ? 'pending' : 'completed');
            }}
            disabled={disabled}
            aria-pressed={isComplete}
            aria-label={isComplete ? 'Mark task incomplete' : 'Mark task complete'}
            className={[
              'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
              isComplete
                ? 'border-[color:var(--accent)] bg-[color:var(--ink)] text-[color:var(--accent)]'
                : 'border-line-default text-transparent hover:border-ink'
            ].join(' ')}
          >
            <Icon icon={Check} className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <p
            className={[
              'text-sm font-semibold',
              isComplete ? 'text-dim-2 line-through' : 'text-ink'
            ].join(' ')}
          >
            {task.name}
          </p>
          {task.description ? (
            <p className="mt-1 text-xs text-dim-2 line-clamp-2">{task.description}</p>
          ) : null}
        </div>

        {due ? (
          <div className="shrink-0 text-right">
            <div
              className={[
                'font-mono text-[11px] uppercase tracking-wide',
                due.overdue && !isComplete ? 'text-[color:var(--neg)]' : 'text-dim-2'
              ].join(' ')}
            >
              {due.overdue && !isComplete ? 'Overdue' : 'Due'}
            </div>
            <div className="text-sm font-medium text-ink">{due.label}</div>
          </div>
        ) : null}

        {onDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Open task actions"
                icon={MoreVertical}
                iconClassName="h-4 w-4"
                disabled={disabled}
                onClick={(event) => event.stopPropagation()}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <div className="py-1">
                <DropdownMenuItem onSelect={() => onDelete(task)}>
                  <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <Icon icon={Trash2} className="h-4 w-4" />
                    Delete
                  </span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-8">
        <MatterChip
          urgent={Boolean(task.matterUrgent)}
          onClick={onOpenMatter ? (event) => {
            event.stopPropagation();
            onOpenMatter(task.matterId);
          } : undefined}
        >
          {task.matterTitle}
        </MatterChip>
        <Pill tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Pill>
        <Pill tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Pill>
        {task.stage ? (
          <span className="font-mono text-[11px] uppercase tracking-wide text-dim-2">
            {task.stage}
          </span>
        ) : null}
      </div>
    </div>
  );
};
