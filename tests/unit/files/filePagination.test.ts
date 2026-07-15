import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listClientMatters, listMatters } from '@/features/matters/services/mattersApi';
import { listIntakes } from '@/features/intake/api/intakesApi';
import {
  listAllClientFileMatters,
  listAllFileIntakes,
  listAllFileMatters,
} from '@/features/files/hooks/pagination';

vi.mock('@/features/matters/services/mattersApi', () => ({
  listClientMatters: vi.fn(),
  listMatters: vi.fn(),
}));

vi.mock('@/features/intake/api/intakesApi', () => ({
  listIntakes: vi.fn(),
}));

describe('file pagination sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listClientMatters).mockResolvedValue([]);
    vi.mocked(listMatters).mockResolvedValue([]);
    vi.mocked(listIntakes).mockResolvedValue({ data: [], pagination: { page: 1, limit: 100, total: 0 } });
  });

  it('uses the authenticated client matter collection for client files', async () => {
    await listAllClientFileMatters('practice-1');

    expect(listClientMatters).toHaveBeenCalledWith('practice-1', expect.objectContaining({ page: 1 }));
    expect(listMatters).not.toHaveBeenCalled();
  });

  it('keeps practice matter and intake collections for practice files', async () => {
    await Promise.all([listAllFileMatters('practice-1'), listAllFileIntakes('practice-1')]);

    expect(listMatters).toHaveBeenCalledWith('practice-1', expect.objectContaining({ page: 1 }));
    expect(listIntakes).toHaveBeenCalledWith(
      'practice-1',
      expect.objectContaining({ page: 1 }),
      expect.any(Object),
    );
  });
});
