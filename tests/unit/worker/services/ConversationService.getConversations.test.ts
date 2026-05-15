import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../../../../worker/services/ConversationService.js';
import type { Env } from '../../../../worker/types.js';

type SqlSpy = {
  env: Env;
  capturedQuery: { sql: string | null };
  capturedBindings: { values: unknown[] };
  setResults: (rows: Array<Record<string, unknown>>) => void;
};

const createSqlSpyEnv = (initialResults: Array<Record<string, unknown>> = []): SqlSpy => {
  const capturedQuery = { sql: null as string | null };
  const capturedBindings = { values: [] as unknown[] };
  const state = { results: initialResults };

  const all = vi.fn(() => Promise.resolve({ results: state.results }));
  const bind = vi.fn((...args: unknown[]) => {
    capturedBindings.values = args;
    return { all };
  });
  const prepare = vi.fn((sql: string) => {
    capturedQuery.sql = sql;
    return { bind };
  });

  const env = {
    DB: { prepare } as unknown as Env['DB'],
    CHAT_SESSIONS: {} as Env['CHAT_SESSIONS'],
    ONESIGNAL_APP_ID: 'test-app',
    ONESIGNAL_REST_API_KEY: 'test-key',
  } as Env;

  return {
    env,
    capturedQuery,
    capturedBindings,
    setResults: (rows) => { state.results = rows; },
  };
};

const baseConversationRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'conv-1',
  practice_id: 'practice-1',
  user_id: 'user-1',
  is_anonymous: 0,
  matter_id: null,
  participants: JSON.stringify(['user-1']),
  user_info: null,
  status: 'active',
  lifecycle_status: 'visible',
  assigned_to: null,
  priority: 'normal',
  tags: null,
  internal_notes: null,
  last_message_at: '2026-05-15T10:00:00.000Z',
  last_message_content: 'denorm content',
  first_response_at: null,
  closed_at: null,
  unread_count: 0,
  latest_seq: 5,
  created_at: '2026-05-15T09:00:00.000Z',
  updated_at: '2026-05-15T10:00:00.000Z',
  ...overrides,
});

describe('ConversationService.getConversations include=latest_message', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('omits latest_message field by default and skips the JOIN', async () => {
    const spy = createSqlSpyEnv([baseConversationRow()]);
    const service = new ConversationService(spy.env);

    const result = await service.getConversations({
      practiceId: 'practice-1',
      userId: 'user-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0].latest_message).toBeUndefined();
    expect(spy.capturedQuery.sql).not.toContain('latest_msg');
    expect(spy.capturedQuery.sql).not.toContain('ROW_NUMBER');
  });

  it('joins latest_msg subquery and surfaces a populated latest_message block', async () => {
    const spy = createSqlSpyEnv([
      baseConversationRow({
        latest_msg_content: 'Hello there',
        latest_msg_role: 'user',
        latest_msg_created_at: '2026-05-15T11:00:00.000Z',
      }),
    ]);
    const service = new ConversationService(spy.env);

    const result = await service.getConversations({
      practiceId: 'practice-1',
      userId: 'user-1',
      includeLatestMessage: true,
    });

    expect(spy.capturedQuery.sql).toContain('latest_msg');
    expect(spy.capturedQuery.sql).toContain('latest_msg_content');
    expect(result[0].latest_message).toEqual({
      content: 'Hello there',
      role: 'user',
      created_at: '2026-05-15T11:00:00.000Z',
    });
  });

  it('returns latest_message=null when the JOIN was requested but no eligible message exists', async () => {
    const spy = createSqlSpyEnv([
      baseConversationRow({
        latest_msg_content: null,
        latest_msg_role: null,
        latest_msg_created_at: null,
      }),
    ]);
    const service = new ConversationService(spy.env);

    const result = await service.getConversations({
      practiceId: 'practice-1',
      includeLatestMessage: true,
    });

    expect(result[0].latest_message).toBeNull();
  });

  it('throws an error when the SQL column carries an unexpected role value', async () => {
    const spy = createSqlSpyEnv([
      baseConversationRow({
        latest_msg_content: 'response',
        latest_msg_role: 'tool',
        latest_msg_created_at: '2026-05-15T11:00:00.000Z',
      }),
    ]);
    const service = new ConversationService(spy.env);

    await expect(service.getConversations({
      practiceId: 'practice-1',
      includeLatestMessage: true,
    })).rejects.toThrow('Invalid latest message role: tool');
  });
});
