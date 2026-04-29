import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  }
}));

vi.mock('@/shared/lib/apiClient', () => {
  function pluckCollection<T>(unwrapped: unknown, candidates: string[]): T[] {
    if (Array.isArray(unwrapped)) return unwrapped as T[];
    if (!unwrapped || typeof unwrapped !== 'object') return [];
    const record = unwrapped as Record<string, unknown>;
    for (const key of candidates) if (Array.isArray(record[key])) return record[key] as T[];
    if (record.data) return pluckCollection<T>(record.data, candidates);
    return [];
  }
  function pluckRecord<T>(unwrapped: unknown, candidates: string[]): T | null {
    if (!unwrapped || typeof unwrapped !== 'object') return null;
    if (Array.isArray(unwrapped)) {
      return (unwrapped.find((item) => item && typeof item === 'object') ?? null) as T | null;
    }
    const record = unwrapped as Record<string, unknown>;
    for (const key of candidates) {
      const value = record[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
    }
    if (record.data) return pluckRecord<T>(record.data, candidates);
    return record as T;
  }
  return {
    apiClient: mockApiClient,
    isAbortError: (e: unknown) => e instanceof Error && e.name === 'AbortError',
    isHttpError: (e: unknown): e is { response: { data: unknown }; message?: string } =>
      typeof e === 'object' && e !== null && 'response' in e,
    unwrapApiResponse: <T>(payload: unknown): T => {
      if (payload && typeof payload === 'object' && 'success' in payload) {
        const env = payload as { success: boolean; data?: unknown; error?: unknown };
        if (env.success === false) throw new Error(typeof env.error === 'string' ? env.error : 'Request failed');
        if ('data' in env) return env.data as T;
      }
      return payload as T;
    },
    pluckCollection,
    pluckRecord,
  };
});

import {
  createMatterTask,
  deleteMatterTask,
  generateMatterTasks,
  listMatterTasks,
  updateMatterTask
} from '@/features/matters/services/mattersApi';

describe('mattersApi task endpoints', () => {
  beforeEach(() => {
    Object.values(mockApiClient).forEach((fn) => fn.mockReset());
  });

  it('lists tasks with expected query params', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { tasks: [{ id: 't1' }] } });

    const result = await listMatterTasks('practice-1', 'matter-1', {
      assignee_id: 'user-1',
      priority: 'high',
      stage: 'Discovery',
      status: 'pending'
    });

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/api/matters/practice-1/matter-1/tasks',
      expect.objectContaining({
        params: {
          assignee_id: 'user-1',
          priority: 'high',
          stage: 'Discovery',
          status: 'pending'
        }
      })
    );
    expect(result).toEqual([{ id: 't1' }]);
  });

  it('creates, updates, deletes, and generates tasks against the new endpoints', async () => {
    mockApiClient.post.mockResolvedValueOnce({ data: { task: { id: 't-create' } } });
    mockApiClient.patch.mockResolvedValueOnce({ data: { task: { id: 't-update' } } });
    mockApiClient.delete.mockResolvedValueOnce({ data: { success: true } });
    mockApiClient.post.mockResolvedValueOnce({ data: { tasks: [{ id: 't-bulk' }] } });

    await createMatterTask('practice-1', 'matter-1', {
      name: 'Draft motion',
      stage: 'Pleadings'
    });
    await updateMatterTask('practice-1', 'matter-1', 'task-1', { status: 'completed' });
    const deleted = await deleteMatterTask('practice-1', 'matter-1', 'task-1');
    const generated = await generateMatterTasks('practice-1', 'matter-1', {
      template_name: 'Starter',
      tasks: [{ name: 'Open file', stage: 'Intake' }]
    });

    expect(mockApiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/matters/practice-1/matter-1/tasks',
      { name: 'Draft motion', stage: 'Pleadings' },
      expect.any(Object)
    );
    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/api/matters/practice-1/matter-1/tasks/task-1',
      { status: 'completed' },
      expect.any(Object)
    );
    expect(mockApiClient.delete).toHaveBeenCalledWith(
      '/api/matters/practice-1/matter-1/tasks/task-1',
      expect.any(Object)
    );
    expect(mockApiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/matters/practice-1/matter-1/tasks/generate',
      { template_name: 'Starter', tasks: [{ name: 'Open file', stage: 'Intake' }] },
      expect.any(Object)
    );
    expect(deleted).toBe(true);
    expect(generated).toEqual([{ id: 't-bulk' }]);
  });

  it('surfaces backend error messages from task requests', async () => {
    mockApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Bad Request',
      response: {
        data: { error: 'stage is required' }
      }
    });

    await expect(
      createMatterTask('practice-1', 'matter-1', {
        name: 'Task with stage',
        stage: 'Discovery'
      })
    ).rejects.toThrow('stage is required');
  });
});
