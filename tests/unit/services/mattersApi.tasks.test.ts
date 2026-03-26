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

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: mockApiClient
}));

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
