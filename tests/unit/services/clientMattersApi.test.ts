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
  getClientMatter,
  getClientMatterActivity,
  listClientMatterNotes,
  listClientMatterTasks,
  listClientMatters,
} from '@/features/matters/services/mattersApi';

describe('client matter API endpoints', () => {
  beforeEach(() => {
    Object.values(mockApiClient).forEach((fn) => fn.mockReset());
  });

  it('lists client matters without using the practice matter list route', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { matters: [{ id: 'matter-1' }] } });

    const result = await listClientMatters('practice-1', { page: 2, limit: 10 });

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/api/matters/practice-1/client',
      expect.objectContaining({
        params: { page: '2', limit: '10' },
      })
    );
    expect(mockApiClient.get).not.toHaveBeenCalledWith('/api/matters/practice-1', expect.any(Object));
    expect(result).toEqual([{ id: 'matter-1' }]);
  });

  it('loads client matter detail and read-only child resources from client-scoped paths', async () => {
    mockApiClient.get
      .mockResolvedValueOnce({ data: { matter: { id: 'matter-1' } } })
      .mockResolvedValueOnce({ data: { activities: [{ id: 'activity-1' }] } })
      .mockResolvedValueOnce({ data: { notes: [{ id: 'note-1' }] } })
      .mockResolvedValueOnce({ data: { tasks: [{ id: 'task-1' }] } });

    await getClientMatter('practice-1', 'matter-1');
    await getClientMatterActivity('practice-1', 'matter-1');
    await listClientMatterNotes('practice-1', 'matter-1');
    await listClientMatterTasks('practice-1', 'matter-1', { status: 'pending' });

    expect(mockApiClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/matters/practice-1/client/matter-1',
      expect.any(Object)
    );
    expect(mockApiClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/matters/practice-1/client/matter-1/activity',
      expect.any(Object)
    );
    expect(mockApiClient.get).toHaveBeenNthCalledWith(
      3,
      '/api/matters/practice-1/client/matter-1/notes',
      expect.any(Object)
    );
    expect(mockApiClient.get).toHaveBeenNthCalledWith(
      4,
      '/api/matters/practice-1/client/matter-1/tasks',
      expect.objectContaining({
        params: { status: 'pending' },
      })
    );
  });
});
