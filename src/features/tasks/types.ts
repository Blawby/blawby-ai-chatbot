import type { MatterTask } from '@/features/matters/data/matterTypes';

/**
 * Cross-matter Task — extends the existing matter-scoped `MatterTask` with the
 * matter context needed to render rows on the cross-matter Tasks screen
 * (`/practice/:slug/tasks`). The Tasks API is matter-scoped, so the page
 * aggregates per-matter responses and stamps each task with its parent
 * matter title / status for display via `MatterChip`.
 */
export type Task = MatterTask & {
  matterTitle: string;
  matterStatus?: string | null;
  /** Whether this matter currently has an "urgent" cue (e.g. emergency urgency). */
  matterUrgent?: boolean;
};

export type TaskStatus = MatterTask['status'];
export type TaskPriority = MatterTask['priority'];

export type StatusFilter = 'all' | TaskStatus;
export type PriorityFilter = 'all' | TaskPriority;
export type StageFilter = string; // 'all' or any stage value present in the dataset

export type TaskFilters = {
  status: StatusFilter;
  priority: PriorityFilter;
  stage: StageFilter;
};

export type CreateTaskInput = {
  matterId: string;
  name: string;
  stage: string;
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
};

export type UpdateTaskInput = Partial<{
  name: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  stage: string;
}>;
