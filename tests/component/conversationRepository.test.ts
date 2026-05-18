import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConversationParticipantsMock: vi.fn(),
}));

vi.mock('@/shared/lib/apiClient', () => ({
  getConversationParticipants: mocks.getConversationParticipantsMock,
}));

describe('conversationRepository', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T00:00:00.000Z'));
    mocks.getConversationParticipantsMock.mockReset();

    const repository = await import('@/shared/lib/conversationRepository');
    repository.clearParticipants();
  });

  it('dedupes concurrent callers for the same key', async () => {
    mocks.getConversationParticipantsMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 10))
    );

    const repository = await import('@/shared/lib/conversationRepository');
    const first = repository.getParticipants('practice-1', 'conversation-1');
    const second = repository.getParticipants('practice-1', 'conversation-1');

    await vi.advanceTimersByTimeAsync(10);

    await expect(first).resolves.toEqual([]);
    await expect(second).resolves.toEqual([]);
    expect(mocks.getConversationParticipantsMock).toHaveBeenCalledTimes(1);
  });

  it('caches empty successful responses', async () => {
    mocks.getConversationParticipantsMock.mockResolvedValue([]);

    const repository = await import('@/shared/lib/conversationRepository');

    await expect(repository.getParticipants('practice-1', 'conversation-1')).resolves.toEqual([]);
    await expect(repository.getParticipants('practice-1', 'conversation-1')).resolves.toEqual([]);

    expect(mocks.getConversationParticipantsMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed requests', async () => {
    mocks.getConversationParticipantsMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([]);

    const repository = await import('@/shared/lib/conversationRepository');

    await expect(repository.getParticipants('practice-1', 'conversation-1')).rejects.toThrow('boom');
    await expect(repository.getParticipants('practice-1', 'conversation-1')).resolves.toEqual([]);

    expect(mocks.getConversationParticipantsMock).toHaveBeenCalledTimes(2);
  });

  it('refetches after ttl expiry', async () => {
    mocks.getConversationParticipantsMock
      .mockResolvedValueOnce([{ userId: 'u1', name: 'First', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: true, canBeMentionedByClient: true }])
      .mockResolvedValueOnce([{ userId: 'u1', name: 'Second', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: true, canBeMentionedByClient: true }]);

    const repository = await import('@/shared/lib/conversationRepository');

    await expect(repository.getParticipants('practice-1', 'conversation-1')).resolves.toEqual([
      expect.objectContaining({ name: 'First' }),
    ]);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(repository.getParticipants('practice-1', 'conversation-1')).resolves.toEqual([
      expect.objectContaining({ name: 'Second' }),
    ]);

    expect(mocks.getConversationParticipantsMock).toHaveBeenCalledTimes(2);
  });

  it('refetches after manual invalidation', async () => {
    mocks.getConversationParticipantsMock
      .mockResolvedValueOnce([{ userId: 'u1', name: 'First', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: true, canBeMentionedByClient: true }])
      .mockResolvedValueOnce([{ userId: 'u1', name: 'Second', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: true, canBeMentionedByClient: true }]);

    const repository = await import('@/shared/lib/conversationRepository');

    await repository.getParticipants('practice-1', 'conversation-1');
    repository.invalidateParticipants('practice-1', 'conversation-1');
    await expect(repository.getParticipants('practice-1', 'conversation-1')).resolves.toEqual([
      expect.objectContaining({ name: 'Second' }),
    ]);

    expect(mocks.getConversationParticipantsMock).toHaveBeenCalledTimes(2);
  });

  it('clears cached entries on logout event', async () => {
    mocks.getConversationParticipantsMock
      .mockResolvedValueOnce([{ userId: 'u1', name: 'First', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: true, canBeMentionedByClient: true }])
      .mockResolvedValueOnce([{ userId: 'u1', name: 'Second', image: null, role: null, isTeamMember: false, canBeMentionedByTeamMember: true, canBeMentionedByClient: true }]);

    const repository = await import('@/shared/lib/conversationRepository');

    await repository.getParticipants('practice-1', 'conversation-1');
    window.dispatchEvent(new CustomEvent('auth:session-cleared'));
    await expect(repository.getParticipants('practice-1', 'conversation-1')).resolves.toEqual([
      expect.objectContaining({ name: 'Second' }),
    ]);

    expect(mocks.getConversationParticipantsMock).toHaveBeenCalledTimes(2);
  });
});
