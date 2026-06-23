import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createMatterTask,
  deleteMatterTask,
  listPracticeTasks,
  listMatters,
  updateMatterTask,
  type BackendMatter,
  type BackendPracticeTask,
  type CreateMatterTaskPayload,
  type UpdateMatterTaskPayload
} from '@/features/matters/services/mattersApi';
import { toMatterTask } from '@/features/matters/utils/matterUtils';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@/features/tasks/types';

const PAGE_SIZE = 50;

const isMatterUrgent = (matter: BackendMatter): boolean => {
  const urgency = (matter.urgency ?? '').toString().toLowerCase();
  return urgency === 'emergency' || urgency === 'time_sensitive';
};

const normalizeStatus = (status: BackendPracticeTask['status']) =>
  status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'blocked'
    ? status
    : 'pending';

const normalizePriority = (priority: BackendPracticeTask['priority']) =>
  priority === 'low' || priority === 'normal' || priority === 'high' || priority === 'urgent'
    ? priority
    : 'normal';

const isPracticeTaskUrgent = (task: BackendPracticeTask): boolean => {
  const record = task as BackendPracticeTask & { matter?: BackendMatter | null; matter_urgency?: string | null };
  const urgency = (record.matter?.urgency ?? record.matter_urgency ?? '').toString().toLowerCase();
  return urgency === 'emergency' || urgency === 'time_sensitive';
};

const getPracticeTaskMatterTitle = (task: BackendPracticeTask, matter?: BackendMatter): string => {
  const record = task as BackendPracticeTask & { matter?: BackendMatter | null; matter_title?: string | null };
  const title = record.matter?.title ?? record.matter_title ?? matter?.title ?? '';
  const raw = title.toString().trim();
  return raw.length > 0 ? raw : 'Untitled matter';
};

const toTask = (task: BackendPracticeTask, matter?: BackendMatter): Task | null => {
  if (!task.matter_id) return null;
  const base = toMatterTask({
    ...task,
    matter_id: task.matter_id,
    name: task.name ?? 'Untitled task',
    status: normalizeStatus(task.status),
    priority: normalizePriority(task.priority),
    stage: task.stage ?? '',
  });
  return {
    ...base,
    matterTitle: getPracticeTaskMatterTitle(task, matter),
    matterStatus: matter?.status ?? null,
    matterUrgent: matter ? isMatterUrgent(matter) : isPracticeTaskUrgent(task)
  };
};

type UseTasksResult = {
  tasks: Task[];
  matters: BackendMatter[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  updateTask: (task: Task, patch: UpdateTaskInput) => Promise<void>;
  deleteTask: (task: Task) => Promise<void>;
};

/**
 * Cross-matter Tasks aggregation hook.
 *
 * The practice-wide Tasks API returns tasks across the organization in one
 * request while the matters list supplies create-task options and row context.
 * Each aggregate task is merged with its parent matter metadata (title,
 * status, urgency) without per-matter task fan-out.
 */
export const useTasks = (practiceId: string | null | undefined): UseTasksResult => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadKeyRef = useRef(0);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!practiceId) {
      setTasks([]);
      setMatters([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;
    setIsLoading(true);
    setError(null);

    const run = async () => {
      try {
        // 1. Paginate matters until exhausted.
        const allMatters: BackendMatter[] = [];
        let page = 1;
        // Cap pages to avoid runaway loops in pathological backends.
        const MAX_PAGES = 40;
        for (let i = 0; i < MAX_PAGES; i += 1) {
          const pageItems = await listMatters(practiceId, { page, limit: PAGE_SIZE, signal });
          if (signal.aborted) return;
          allMatters.push(...pageItems);
          if (pageItems.length < PAGE_SIZE) break;
          page += 1;
        }
        setMatters(allMatters);

        // 2. Fetch practice-wide tasks in a single request.
        const practiceTasks = await listPracticeTasks(practiceId, {}, { signal });
        if (signal.aborted) return;

        const matterById = new Map(allMatters.map((matter) => [matter.id, matter]));
        const merged: Task[] = [];
        practiceTasks.forEach((wireTask) => {
          const task = toTask(wireTask, wireTask.matter_id ? matterById.get(wireTask.matter_id) : undefined);
          if (task) merged.push(task);
        });

        setTasks(merged);
      } catch (err) {
        if (signal.aborted) return;
        if ((err as DOMException).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load tasks');
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [practiceId, reloadTick]);

  const refresh = useCallback(async () => {
    reloadKeyRef.current += 1;
    setReloadTick(reloadKeyRef.current);
  }, []);

  const createTask = useCallback(async (input: CreateTaskInput) => {
    if (!practiceId) throw new Error('practiceId is required');
    if (!input.matterId) throw new Error('matterId is required');
    setIsMutating(true);
    try {
      const payload: CreateMatterTaskPayload = {
        name: input.name,
        stage: input.stage,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.assigneeId !== undefined ? { assignee_id: input.assigneeId } : {}),
        ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {})
      };
      await createMatterTask(practiceId, input.matterId, payload);
      await refresh();
    } finally {
      setIsMutating(false);
    }
  }, [practiceId, refresh]);

  const updateTask = useCallback(async (task: Task, patch: UpdateTaskInput) => {
    if (!practiceId) throw new Error('practiceId is required');
    const payload: UpdateMatterTaskPayload = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.assigneeId !== undefined) payload.assignee_id = patch.assigneeId;
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.priority !== undefined) payload.priority = patch.priority;
    if (patch.stage !== undefined) payload.stage = patch.stage;
    if (Object.keys(payload).length === 0) return;
    setIsMutating(true);
    try {
      await updateMatterTask(practiceId, task.matterId, task.id, payload);
      await refresh();
    } finally {
      setIsMutating(false);
    }
  }, [practiceId, refresh]);

  const deleteTaskFn = useCallback(async (task: Task) => {
    if (!practiceId) throw new Error('practiceId is required');
    setIsMutating(true);
    try {
      await deleteMatterTask(practiceId, task.matterId, task.id);
      await refresh();
    } finally {
      setIsMutating(false);
    }
  }, [practiceId, refresh]);

  return useMemo(
    () => ({
      tasks,
      matters,
      isLoading,
      isMutating,
      error,
      refresh,
      createTask,
      updateTask,
      deleteTask: deleteTaskFn
    }),
    [tasks, matters, isLoading, isMutating, error, refresh, createTask, updateTask, deleteTaskFn]
  );
};
