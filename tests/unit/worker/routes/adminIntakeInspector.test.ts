import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAdminIntakeInspector } from '../../../../worker/routes/adminIntakeInspector.js';
import { __setAuthContextForTest } from '../../../../worker/middleware/compose.js';
import { IntakeEventService } from '../../../../worker/services/IntakeEventService.js';
import { ConversationService } from '../../../../worker/services/ConversationService.js';
import { HttpError } from '../../../../worker/types.js';
import type { Env } from '../../../../worker/types.js';

const buildEnv = (overrides: Partial<Env> = {}): Env => ({
  INTAKE_INSPECTOR_ENGINEER_EMAILS: 'eng@blawby.com',
  ...overrides,
} as Env);

const buildRequest = (path: string, method: string = 'GET'): Request =>
  new Request(`https://example.com${path}`, { method });

const attachEngineer = (req: Request, email = 'eng@blawby.com') => {
  __setAuthContextForTest(req, {
    user: { id: 'engineer-1', email, emailVerified: true, name: 'Eng', isAnonymous: false },
    session: { id: 's1', expiresAt: new Date(Date.now() + 60_000) },
    cookie: '',
    isAnonymous: false,
    activeOrganizationId: null,
    activeMembershipRole: null,
    previousAnonUserId: null,
  });
};

describe('handleAdminIntakeInspector — list', () => {
  let getConvSpy: ReturnType<typeof vi.spyOn>;
  let listSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getConvSpy = vi.spyOn(ConversationService.prototype, 'getConversationById');
    listSpy = vi.spyOn(IntakeEventService.prototype, 'listByConversation');
  });
  afterEach(() => {
    getConvSpy.mockRestore();
    listSpy.mockRestore();
  });

  it('returns the timeline turns in chronological order with 200', async () => {
    getConvSpy.mockResolvedValue({
      id: 'conv-1',
      practice_id: 'practice-1',
    } as Awaited<ReturnType<typeof ConversationService.prototype.getConversationById>>);
    listSpy.mockResolvedValue([
      {
        id: 'evt-1', conversation_id: 'conv-1', practice_id: 'practice-1',
        turn_seq: 1, provenance: 'ai_intake',
        mode_resolution: null, user_message: 'hi', model_request: null,
        model_response: null, tool_calls: null, tool_results: null,
        failure_reason: null, created_at: '2026-05-18T10:00:00.000Z',
      },
      {
        id: 'evt-2', conversation_id: 'conv-1', practice_id: 'practice-1',
        turn_seq: 2, provenance: 'submit_intake',
        mode_resolution: null, user_message: null, model_request: null,
        model_response: null, tool_calls: null, tool_results: null,
        failure_reason: null, created_at: '2026-05-18T10:01:00.000Z',
      },
    ]);

    const req = buildRequest('/api/admin/intake-events/conv-1');
    attachEngineer(req);

    const response = await handleAdminIntakeInspector(req, buildEnv());
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.conversation_id).toBe('conv-1');
    expect(body.practice_id).toBe('practice-1');
    expect(Array.isArray(body.turns)).toBe(true);
    expect((body.turns as Array<{ turn_seq: number }>)[0].turn_seq).toBe(1);
    expect((body.turns as Array<{ turn_seq: number }>)[1].turn_seq).toBe(2);
  });

  it('returns 200 with empty turns when conversation has no events', async () => {
    getConvSpy.mockResolvedValue({
      id: 'conv-empty',
      practice_id: 'practice-1',
    } as Awaited<ReturnType<typeof ConversationService.prototype.getConversationById>>);
    listSpy.mockResolvedValue([]);

    const req = buildRequest('/api/admin/intake-events/conv-empty');
    attachEngineer(req);

    const response = await handleAdminIntakeInspector(req, buildEnv());
    expect(response.status).toBe(200);
    const body = await response.json() as { turns: unknown[] };
    expect(body.turns).toEqual([]);
  });

  it('returns 404 when conversation does not exist', async () => {
    getConvSpy.mockRejectedValue(new HttpError(404, 'Conversation not found'));

    const req = buildRequest('/api/admin/intake-events/conv-missing');
    attachEngineer(req);

    const response = await handleAdminIntakeInspector(req, buildEnv());
    expect(response.status).toBe(404);
    const body = await response.json() as { error: string; conversation_id: string };
    expect(body.error).toBe('not_found');
    expect(body.conversation_id).toBe('conv-missing');
  });

  it('throws methodNotAllowed for POST on the list path', async () => {
    getConvSpy.mockResolvedValue({
      id: 'conv-1',
      practice_id: 'practice-1',
    } as Awaited<ReturnType<typeof ConversationService.prototype.getConversationById>>);
    listSpy.mockResolvedValue([]);

    const req = buildRequest('/api/admin/intake-events/conv-1', 'POST');
    attachEngineer(req);

    await expect(handleAdminIntakeInspector(req, buildEnv())).rejects.toMatchObject({
      status: 405,
    });
  });

  it('throws not-found for malformed path', async () => {
    const req = buildRequest('/api/admin/intake-events/');
    attachEngineer(req);

    await expect(handleAdminIntakeInspector(req, buildEnv())).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('handleAdminIntakeInspector — clear-failure', () => {
  let getConvSpy: ReturnType<typeof vi.spyOn>;
  let clearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getConvSpy = vi.spyOn(ConversationService.prototype, 'getConversationById');
    clearSpy = vi.spyOn(ConversationService.prototype, 'clearAiFailed').mockResolvedValue(undefined);
  });
  afterEach(() => {
    getConvSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('calls ConversationService.clearAiFailed and returns 200', async () => {
    getConvSpy.mockResolvedValue({
      id: 'conv-1',
      practice_id: 'practice-1',
    } as Awaited<ReturnType<typeof ConversationService.prototype.getConversationById>>);

    const req = buildRequest('/api/admin/intake-events/conv-1/clear-failure', 'POST');
    attachEngineer(req);

    const response = await handleAdminIntakeInspector(req, buildEnv());
    expect(response.status).toBe(200);
    expect(clearSpy).toHaveBeenCalledWith('conv-1', 'practice-1');
  });

  it('throws methodNotAllowed for GET on clear-failure path', async () => {
    getConvSpy.mockResolvedValue({
      id: 'conv-1',
      practice_id: 'practice-1',
    } as Awaited<ReturnType<typeof ConversationService.prototype.getConversationById>>);

    const req = buildRequest('/api/admin/intake-events/conv-1/clear-failure', 'GET');
    attachEngineer(req);

    await expect(handleAdminIntakeInspector(req, buildEnv())).rejects.toMatchObject({
      status: 405,
    });
  });
});
