import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';
import { handlePracticeTeam } from '../../../worker/routes/practiceTeam.js';

const mocks = vi.hoisted(() => ({
  getPracticeTeamMock: vi.fn(),
}));

vi.mock('../../../worker/services/RemoteApiService.js', () => ({
  RemoteApiService: {
    getPracticeTeam: mocks.getPracticeTeamMock,
  },
}));

describe('handlePracticeTeam', () => {
  const env = {
    BACKEND_API_URL: 'https://example.com',
  } as Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPracticeTeamMock.mockResolvedValue({
      members: [
        {
          userId: 'staff-1',
          email: 'staff@test-blawby.com',
          name: 'Staff Member',
          image: null,
          role: 'member',
          createdAt: null,
          canAssignToMatter: false,
          canMentionInternally: true,
        },
      ],
      summary: {
        seatsIncluded: 3,
        seatsUsed: 1,
      },
    });
  });

  it('returns the worker-owned team view for a practice', async () => {
    const request = new Request('https://example.com/api/practice/practice-1/team');

    const response = await handlePracticeTeam(request, env);
    const payload = await response.json() as {
      success: boolean;
      data: {
        members: Array<{ role: string; canMentionInternally: boolean }>;
        summary: { seatsIncluded: number; seatsUsed: number };
      };
    };

    expect(response.status).toBe(200);
    expect(mocks.getPracticeTeamMock).toHaveBeenCalledWith(env, 'practice-1', request);
    expect(payload.success).toBe(true);
    expect(payload.data.summary).toEqual({
      seatsIncluded: 3,
      seatsUsed: 1,
    });
    expect(payload.data.members).toEqual([
      expect.objectContaining({
        role: 'member',
        canMentionInternally: true,
      }),
    ]);
  });

  it('rejects non-GET methods', async () => {
    const request = new Request('https://example.com/api/practice/practice-1/team', {
      method: 'POST',
    });

    await expect(handlePracticeTeam(request, env)).rejects.toHaveProperty('status', 405);
    expect(mocks.getPracticeTeamMock).not.toHaveBeenCalled();
  });
});
