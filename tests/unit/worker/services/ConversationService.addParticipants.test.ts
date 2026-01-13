import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../../../../worker/services/ConversationService.js';
import { HttpErrors } from '../../../../worker/errorHandler.js';
import type { Env } from '../../../../worker/types.js';

const createMockEnv = () => {
  const run = vi.fn().mockResolvedValue({});
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });

  const env = {
    DB: { prepare } as unknown as Env['DB'],
    CHAT_SESSIONS: {} as Env['CHAT_SESSIONS'],
    ONESIGNAL_APP_ID: 'test-app',
    ONESIGNAL_REST_API_KEY: 'test-key',
  } as Env;

  return { env, prepare, bind, run };
};

describe('ConversationService.addParticipants', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('adds unique participants and updates the conversation', async () => {
    const { env, prepare, bind } = createMockEnv();
    const service = new ConversationService(env);

    const existingConversation = {
      id: 'conv-1',
      practice_id: 'practice-1',
      user_id: 'owner',
      matter_id: null,
      participants: ['owner'],
      user_info: null,
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedConversation = {
      ...existingConversation,
      participants: ['owner', 'user-2'],
    };

    const getConversationSpy = vi
      .spyOn(service, 'getConversation')
      .mockResolvedValueOnce(existingConversation)
      .mockResolvedValueOnce(updatedConversation);

    const result = await service.addParticipants('conv-1', 'practice-1', ['user-2']);

    expect(getConversationSpy).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledWith(
      JSON.stringify(['owner', 'user-2']),
      expect.any(String),
      'conv-1',
      'practice-1'
    );
    expect(result.participants).toEqual(['owner', 'user-2']);
  });

  it('returns existing conversation when all participants already present', async () => {
    const { env, prepare } = createMockEnv();
    const service = new ConversationService(env);

    const existingConversation = {
      id: 'conv-1',
      practice_id: 'practice-1',
      user_id: 'owner',
      matter_id: null,
      participants: ['owner', 'user-2'],
      user_info: null,
      status: 'active' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(service, 'getConversation').mockResolvedValue(existingConversation);

    const result = await service.addParticipants('conv-1', 'practice-1', ['owner']);

    expect(prepare).not.toHaveBeenCalled();
    expect(result.participants).toEqual(['owner', 'user-2']);
  });

  it('throws when no participantUserIds are provided', async () => {
    const { env } = createMockEnv();
    const service = new ConversationService(env);

    await expect(
      service.addParticipants('conv-1', 'practice-1', [])
    ).rejects.toHaveProperty('status', HttpErrors.badRequest('').status);
  });
});
