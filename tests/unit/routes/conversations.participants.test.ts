import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';

const mocks = vi.hoisted(() => ({
  optionalAuthMock: vi.fn(),
  withPracticeContextMock: vi.fn(async (request: Request) => request),
  getPracticeIdMock: vi.fn(() => 'practice-1'),
  checkPracticeMembershipMock: vi.fn(),
  validateParticipantAccessMock: vi.fn(),
  addParticipantsMock: vi.fn(),
  getConversationMock: vi.fn(),
  getPracticeMembersMock: vi.fn(),
  getPracticeTeamMock: vi.fn(),
}));

vi.mock('../../../worker/middleware/auth.js', () => ({
  optionalAuth: mocks.optionalAuthMock,
  requirePracticeMember: vi.fn(),
  checkPracticeMembership: mocks.checkPracticeMembershipMock,
}));

vi.mock('../../../worker/middleware/practiceContext.js', () => ({
  withPracticeContext: mocks.withPracticeContextMock,
  getPracticeId: mocks.getPracticeIdMock,
}));

vi.mock('../../../worker/services/ConversationService.js', () => ({
  ConversationService: vi.fn().mockImplementation(() => ({
    createConversation: vi.fn(),
    getConversations: vi.fn(),
    getConversation: mocks.getConversationMock,
    updateConversation: vi.fn(),
    validateParticipantAccess: mocks.validateParticipantAccessMock,
    addParticipants: mocks.addParticipantsMock,
  })),
}));

vi.mock('../../../worker/services/RemoteApiService.js', () => ({
  RemoteApiService: {
    getPracticeMembers: mocks.getPracticeMembersMock,
    getPracticeTeam: mocks.getPracticeTeamMock,
  },
}));

let handleConversations: (request: Request, env: Env) => Promise<Response>;

beforeAll(async () => {
  ({ handleConversations } = await import('../../../worker/routes/conversations.js'));
});

describe('handleConversations - participants endpoint', () => {
  const env = {
    DB: {} as Env['DB'],
    CHAT_SESSIONS: {} as Env['CHAT_SESSIONS'],
    ONESIGNAL_APP_ID: 'test-app',
    ONESIGNAL_REST_API_KEY: 'test-key',
  } as Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.optionalAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.checkPracticeMembershipMock.mockResolvedValue({ isMember: true, memberRole: 'owner' });
    mocks.addParticipantsMock.mockResolvedValue({ id: 'conv-1' });
    mocks.getConversationMock.mockResolvedValue({ participants: ['client-1'], user_id: 'client-1' });
    mocks.getPracticeMembersMock.mockResolvedValue([
      { user_id: 'client-1', role: 'client', name: 'Client Person', image: null },
      { user_id: 'staff-1', role: 'member', name: 'Staff Person', image: null },
    ]);
    mocks.getPracticeTeamMock.mockResolvedValue({
      members: [
        {
          userId: 'staff-1',
          email: 'staff@example.com',
          name: 'Staff Person',
          image: null,
          role: 'member',
          createdAt: null,
          canAssignToMatter: false,
          canMentionInternally: true,
        },
      ],
      summary: { seatsIncluded: 2, seatsUsed: 1 },
    });
  });

  it('adds participants when caller is authorized', async () => {
    const request = new Request('https://example.com/api/conversations/conv-1/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantUserIds: ['user-2', 'user-3'] }),
    });

    const response = await handleConversations(request, env);
    const payload = await response.json() as { success?: boolean };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.validateParticipantAccessMock).toHaveBeenCalledWith(
      'conv-1',
      'practice-1',
      'user-1',
      { previousAnonUserId: null }
    );
    expect(mocks.addParticipantsMock).toHaveBeenCalledWith('conv-1', 'practice-1', ['user-2', 'user-3']);
  });

  it('rejects requests without auth context', async () => {
    mocks.optionalAuthMock.mockResolvedValueOnce(null);

    const request = new Request('https://example.com/api/conversations/conv-1/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantUserIds: ['user-2'] }),
    });

    await expect(handleConversations(request, env)).rejects.toHaveProperty('status', 401);
  });

  it('rejects missing participantUserIds', async () => {
    const request = new Request('https://example.com/api/conversations/conv-1/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantUserIds: [] }),
    });

    await expect(handleConversations(request, env)).rejects.toHaveProperty('status', 400);
    expect(mocks.addParticipantsMock).not.toHaveBeenCalled();
  });

  it('expands mention candidates with the worker team view and flags internal mentions', async () => {
    const request = new Request('https://example.com/api/conversations/conv-1/participants?practiceId=practice-1');

    const response = await handleConversations(request, env);
    const payload = await response.json() as {
      success?: boolean;
      data?: {
        participants?: Array<{ userId: string; canMentionInternally?: boolean; role?: string | null }>;
      };
    };

    expect(response.status).toBe(200);
    expect(mocks.getPracticeTeamMock).toHaveBeenCalledWith(env, 'practice-1', request);
    expect(payload.success).toBe(true);
    expect(payload.data?.participants).toEqual([
      expect.objectContaining({
        userId: 'client-1',
        role: 'client',
        canMentionInternally: false,
      }),
      expect.objectContaining({
        userId: 'staff-1',
        role: 'member',
        canMentionInternally: true,
      }),
    ]);
  });
});
