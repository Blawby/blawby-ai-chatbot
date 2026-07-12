import { afterEach, describe, expect, it, vi } from 'vitest';

import { PracticeAssistantActionService } from '../../../worker/services/practiceAssistant/actionService.js';
import type { Env } from '../../../worker/types.js';

type ActionRow = {
  id: string;
  practice_id: string;
  conversation_id: string;
  created_by_user_id: string;
  tool_use_id: string;
  tool_name: string;
  status: 'approved' | 'executed' | 'failed';
  approval_summary_json: string;
  payload_json: string;
  result_json: string | null;
  error_message: string | null;
  executed_at: string | null;
};

const makeHarness = () => {
  const row: ActionRow = {
    id: 'action-719',
    practice_id: 'practice-a',
    conversation_id: 'conversation-1',
    created_by_user_id: 'owner-1',
    tool_use_id: 'tool-1',
    tool_name: 'run_entity_action',
    status: 'approved',
    approval_summary_json: JSON.stringify({ title: 'Send invoice', description: 'Send invoice invoice-1.' }),
    payload_json: JSON.stringify({
      actionType: 'run_entity_action',
      entityType: 'invoice',
      id: 'invoice-1',
      action: 'send',
      input: { delivery: 'email' },
    }),
    result_json: null,
    error_message: null,
    executed_at: null,
  };

  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => {
        if (!sql.includes('SELECT *')) return null;
        return args[0] === row.id && args[1] === row.practice_id ? { ...row } : null;
      },
      run: async () => {
        if (sql.includes('SET executed_at = ?')) {
          if (row.status !== 'approved' || row.executed_at !== null) return { meta: { changes: 0 } };
          row.executed_at = String(args[0]);
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status = 'executed'")) {
          row.status = 'executed';
          row.result_json = String(args[0]);
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status = 'failed'")) {
          row.status = 'failed';
          row.error_message = String(args[0]);
          return { meta: { changes: 1 } };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    }),
  }));

  const env = {
    DB: { prepare },
    BACKEND_API_URL: 'https://staging-api.blawby.com',
  } as unknown as Env;
  return { env, row };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('practice assistant action execution safety', () => {
  it('executes the stored payload once with an action-bound idempotency key', async () => {
    const { env, row } = makeHarness();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'sent' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new PracticeAssistantActionService(env);

    const result = await service.executeApproved(
      row.id,
      row.practice_id,
      new Request('https://ai.blawby.com/api/ai/practice-assistant/actions/action-719/approve'),
    );

    expect(result.status).toBe('executed');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://staging-api.blawby.com/api/invoices/practice-a/invoice-1/send');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('practice-assistant-action:action-719');
    expect(JSON.parse(String(init.body))).toEqual({ delivery: 'email' });

    await expect(service.executeApproved(
      row.id,
      row.practice_id,
      new Request('https://ai.blawby.com/api/ai/practice-assistant/actions/action-719/approve'),
    )).rejects.toThrow('Action must be approved before execution');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not allow an approved action to cross Practice boundaries', async () => {
    const { env, row } = makeHarness();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new PracticeAssistantActionService(env).executeApproved(
      row.id,
      'practice-b',
      new Request('https://ai.blawby.com/api/ai/practice-assistant/actions/action-719/approve'),
    )).rejects.toThrow('Action not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('persists a correlation reference without persisting backend error details', async () => {
    const { env, row } = makeHarness();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'database password and internal stack details',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })));

    await expect(new PracticeAssistantActionService(env).executeApproved(
      row.id,
      row.practice_id,
      new Request('https://ai.blawby.com/api/ai/practice-assistant/actions/action-719/approve', {
        headers: { 'x-correlation-id': 'corr-719' },
      }),
    )).rejects.toMatchObject({
      status: 500,
      details: { correlationId: 'corr-719' },
    });

    expect(row.status).toBe('failed');
    expect(row.error_message).toBe('Execution failed. Correlation ID: corr-719');
    expect(row.error_message).not.toContain('password');
    expect(row.error_message).not.toContain('stack');
  });
});
