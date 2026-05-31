import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createMatterTask,
  deleteMatterTask,
  listMatters,
  listMatterTasks,
  updateMatterTask,
  type BackendMatter,
  type CreateMatterTaskPayload,
  type UpdateMatterTaskPayload
} from '@/features/matters/services/mattersApi';
import { toMatterTask } from '@/features/matters/utils/matterUtils';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@/features/tasks/types';

const PAGE_SIZE = 50;

const buildMatterTitle = (matter: BackendMatter): string => {
  const raw = (matter.title ?? '').toString().trim();
  return raw.length > 0 ? raw : 'Untitled matter';
};

const isMatterUrgent = (matter: BackendMatter): boolean => {
  const urgency = (matter.urgency ?? '').toString().toLowerCase();
  return urgency === 'emergency' || urgency === 'time_sensitive';
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
 * The Tasks API is matter-scoped (`/api/matters/:practice/:matter/tasks`), so
 * the cross-matter Tasks screen must fan-out across the practice's matters and
 * merge each matter-row task list with its parent-matter context (title,
 * status, urgency) — this hook owns that fan-out + the per-task mutations.
 *
 * No top-level `/api/practices/:id/tasks` endpoint is exposed on the worker;
 * a `BackendPracticeTask` shape exists for the internal ReportService but it
 * is not surfaced to the frontend. If/when a real aggregation endpoint ships,
 * swap the fan-out below for a single fetch.
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

        // 2. Fan-out task fetches per matter, tolerating individual failures
        //    so one missing matter doesn't blank the whole screen.
        const settled = await Promise.allSettled(
          allMatters.map((matter) =>
            listMatterTasks(practiceId, matter.id, {}, { signal })
          )
        );
        if (signal.aborted) return;

        const merged: Task[] = [];
        settled.forEach((result, index) => {
          const matter = allMatters[index];
          if (!matter) return;
          if (result.status !== 'fulfilled') return;
          const matterTitle = buildMatterTitle(matter);
          const matterStatus = matter.status ?? null;
          const matterUrgent = isMatterUrgent(matter);
          for (const wireTask of result.value) {
            const base = toMatterTask(wireTask);
            merged.push({
              ...base,
              matterTitle,
              matterStatus,
              matterUrgent
            });
          }
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
