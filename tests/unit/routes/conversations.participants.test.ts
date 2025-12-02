import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';

const mocks = vi.hoisted(() => ({
  optionalAuthMock: vi.fn(),
  withPracticeContextMock: vi.fn(async (request: Request) => request),
  getPracticeIdMock: vi.fn(() => 'practice-1'),
  validateParticipantAccessMock: vi.fn(),
  addParticipantsMock: vi.fn(),
}));

vi.mock('../../../worker/middleware/auth.js', () => ({
  optionalAuth: mocks.optionalAuthMock,
}));

vi.mock('../../../worker/middleware/practiceContext.js', () => ({
  withPracticeContext: mocks.withPracticeContextMock,
  getPracticeId: mocks.getPracticeIdMock,
}));

vi.mock('../../../worker/services/ConversationService.js', () => ({
  ConversationService: vi.fn().mockImplementation(() => ({
    createConversation: vi.fn(),
    getConversations: vi.fn(),
    getConversation: vi.fn(),
    updateConversation: vi.fn(),
    validateParticipantAccess: mocks.validateParticipantAccessMock,
    addParticipants: mocks.addParticipantsMock,
  })),
}));

let handleConversations: (request: Request, env: Env) => Promise<Response>;

beforeAll(async () => {
  ({ handleConversations } = await import('../../../worker/routes/conversations.js'));
});

describe('handleConversations - participants endpoint', () => {
  const env = {
    DB: {} as Env['DB'],
    CHAT_SESSIONS: {} as Env['CHAT_SESSIONS'],
    RESEND_API_KEY: 'test-key',
  } as Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.optionalAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.addParticipantsMock.mockResolvedValue({ id: 'conv-1' });
  });

  it('adds participants when caller is authorized', async () => {
    const request = new Request('https://example.com/api/conversations/conv-1/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantUserIds: ['user-2', 'user-3'] }),
    });

    const response = await handleConversations(request, env);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.validateParticipantAccessMock).toHaveBeenCalledWith('conv-1', 'practice-1', 'user-1');
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
});
