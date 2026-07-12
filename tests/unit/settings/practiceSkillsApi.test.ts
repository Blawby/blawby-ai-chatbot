import { beforeEach, describe, expect, it, vi } from 'vitest';

import { practiceSkillsApi } from '@/features/settings/services/practiceSkillsApi';
import { apiClient } from '@/shared/lib/apiClient';

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const contract = {
  enabled_skills: ['matter_management'],
  available_skills: [
    {
      key: 'matter_management',
      label: 'Matter management',
      description: 'Work with matters.',
      version: 1,
      scopes: ['matters:read'],
    },
  ],
  effective_scopes: ['matters:read'],
  prompt_contribution: 'Matter management is enabled.',
};

describe('practiceSkillsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads and replaces enabled practice skills through the durable API', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: contract } as never);
    vi.mocked(apiClient.put).mockResolvedValue({ data: contract } as never);

    await expect(practiceSkillsApi.get('practice id')).resolves.toEqual(contract);
    await expect(practiceSkillsApi.update('practice id', ['matter_management'])).resolves.toEqual(contract);
    expect(apiClient.get).toHaveBeenCalledWith('/api/practice/practice%20id/skills', { signal: undefined });
    expect(apiClient.put).toHaveBeenCalledWith('/api/practice/practice%20id/skills', {
      enabled_skills: ['matter_management'],
    });
  });

  it('rejects malformed backend contracts rather than inventing defaults', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { enabled_skills: ['billing'] } } as never);
    await expect(practiceSkillsApi.get('practice-1')).rejects.toThrow('response was malformed');
  });
});
