// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/preact';
import { usePracticeTeam } from '../usePracticeTeam';
import { resetPracticeTeamStore } from '@/shared/stores/practiceTeamStore';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => (
    window.setTimeout(() => callback(Date.now()), 0)
  )) as typeof globalThis.requestAnimationFrame;
}

if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = ((handle: number) => {
    window.clearTimeout(handle);
  }) as typeof globalThis.cancelAnimationFrame;
}

const mocks = vi.hoisted(() => ({
  listPracticeTeamMock: vi.fn(),
}));

vi.mock('@/shared/lib/apiClient', () => ({
  listPracticeTeam: mocks.listPracticeTeamMock,
}));

describe('usePracticeTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPracticeTeamStore();
    mocks.listPracticeTeamMock.mockResolvedValue({
      members: [
        {
          userId: 'staff-1',
          email: 'staff@example.com',
          name: 'Staff Member',
          image: null,
          role: 'admin',
          createdAt: 123,
          canAssignToMatter: true,
          canMentionInternally: true,
        },
      ],
      summary: {
        seatsIncluded: 2,
        seatsUsed: 1,
      },
    });
  });

  it('loads and caches the team response by user and practice', async () => {
    const first = renderHook(() => usePracticeTeam('practice-1', 'user-1'));

    await waitFor(() => {
      expect(first.result.current.members).toHaveLength(1);
    });

    expect(first.result.current.summary).toEqual({
      seatsIncluded: 2,
      seatsUsed: 1,
    });
    expect(mocks.listPracticeTeamMock).toHaveBeenCalledTimes(1);

    const second = renderHook(() => usePracticeTeam('practice-1', 'user-1'));

    await waitFor(() => {
      expect(second.result.current.members).toHaveLength(1);
    });

    expect(mocks.listPracticeTeamMock).toHaveBeenCalledTimes(1);
  });

  it('separates cache entries when the authenticated user changes', async () => {
    mocks.listPracticeTeamMock
      .mockResolvedValueOnce({
        members: [
          {
            userId: 'staff-1',
            email: 'staff@example.com',
            name: 'Staff Member',
            image: null,
            role: 'admin',
            createdAt: 123,
            canAssignToMatter: true,
            canMentionInternally: true,
          },
        ],
        summary: {
          seatsIncluded: 2,
          seatsUsed: 1,
        },
      })
      .mockResolvedValue({
        members: [
          {
            userId: 'staff-2',
            email: 'next@example.com',
            name: 'Next User Team',
            image: null,
            role: 'member',
            createdAt: 456,
            canAssignToMatter: false,
            canMentionInternally: true,
          },
        ],
        summary: {
          seatsIncluded: 5,
          seatsUsed: 1,
        },
      });

    const first = renderHook(() => usePracticeTeam('practice-1', 'user-1'));

    await waitFor(() => {
      expect(first.result.current.members).toHaveLength(1);
    });

    first.unmount();

    const second = renderHook(() => usePracticeTeam('practice-1', 'user-2'));

    await waitFor(() => {
      expect(second.result.current.members).toHaveLength(1);
    });

    expect(second.result.current.members[0]).toMatchObject({
      userId: 'staff-2',
      email: 'next@example.com',
      canAssignToMatter: false,
    });
    expect(second.result.current.summary).toEqual({
      seatsIncluded: 5,
      seatsUsed: 1,
    });
  });
});
