import type { Env } from '../types.js';
import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { requirePracticeMember } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';
import { createSseResponse } from './aiChatShared.js';
import { PracticeAssistantAuditService } from '../services/practiceAssistant/auditService.js';
import { PracticeAssistantActionService } from '../services/practiceAssistant/actionService.js';
import { PracticeAssistantQueryEngine } from '../services/practiceAssistant/PracticeAssistantQueryEngine.js';
import { Logger } from '../utils/logger.js';

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ success: status < 400, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const getString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw HttpErrors.badRequest(`${field} is required`);
  }
  return value.trim();
};

export interface PracticeAssistantTurnParams {
  conversationId: string;
  practiceId: string;
  practiceSlug: string | null;
  userMessage: string;
  userId: string;
  auth: AuthContext & { memberRole: string };
  env: Env;
  request: Request;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export function runPracticeAssistantTurn(params: PracticeAssistantTurnParams): Response {
  const { conversationId, practiceId, practiceSlug, userMessage, userId, auth, env, request, messages } = params;
  const { response, write, close } = createSseResponse();
  Logger.info('practice_assistant.sse.prepared', {
    conversationId,
    practiceId,
    messageCount: messages?.length ?? null,
    userMessageLength: userMessage.length,
  });
  queueMicrotask(async () => {
    Logger.info('practice_assistant.producer.started', {
      conversationId,
      practiceId,
    });
    const engine = new PracticeAssistantQueryEngine({
      conversationId, practiceId, practiceSlug, userId, auth, env, request,
      initialMessages: messages,
    });
    try {
      for await (const event of engine.submitMessage(userMessage)) {
        Logger.info('practice_assistant.producer.event', {
          conversationId,
          eventType: event.type,
          tokenLength: event.type === 'token' ? event.token.length : null,
          toolName: event.type === 'tool_progress' ? event.progress.toolName : null,
          toolStatus: event.type === 'tool_progress' ? event.progress.status : null,
          replyLength: event.type === 'done' ? event.reply.length : null,
          errorCode: event.type === 'error' ? event.code : null,
          errorMessage: event.type === 'error' ? event.message : null,
        });
        if (event.type === 'token') write({ token: event.token });
        if (event.type === 'tool_progress') write({ type: 'tool_progress', progress: event.progress });
        if (event.type === 'done') {
          write({
            done: true,
            reply: event.reply,
            persistedMessageId: event.persistedMessageId,
            metadata: event.metadata,
            actions: event.actions,
          });
        }
        if (event.type === 'error') {
          write({ error: true, code: event.code, message: event.message });
        }
      }
    } finally {
      Logger.info('practice_assistant.producer.closing', {
        conversationId,
        practiceId,
      });
      close();
    }
  });
  return response;
}

async function handleAction(request: Request, env: Env, actionId: string, decision: 'approve' | 'reject'): Promise<Response> {
  if (request.method !== 'POST') throw HttpErrors.methodNotAllowed('Only POST is supported');
  const body = await parseJsonBody(request) as { practiceId?: unknown };
  const practiceId = getString(body.practiceId, 'practiceId');
  const auth = await requirePracticeMember(request, env, practiceId, 'paralegal');
  const service = new PracticeAssistantActionService(env);
  const row = await service.getRow(actionId, practiceId);
  const approvedOrRejected = decision === 'approve'
    ? await service.approve(actionId, practiceId)
    : await service.reject(actionId, practiceId);
  const finalSummary = decision === 'approve'
    ? await service.executeApproved(actionId, practiceId, request)
    : approvedOrRejected;
  await new PracticeAssistantAuditService(env).record({
    conversationId: row.conversation_id,
    practiceId,
    eventType: decision === 'approve' ? 'practice_assistant.action_approved' : 'practice_assistant.action_rejected',
    actorType: 'lawyer',
    actorId: auth.user.id,
    payload: { actionId, status: finalSummary.status },
  });
  return json({ action: finalSummary });
}

export async function handlePracticeAssistant(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/ai\/practice-assistant\/actions\/([^/]+)\/(approve|reject)$/);
  if (match) {
    return handleAction(request, env, decodeURIComponent(match[1]), match[2] as 'approve' | 'reject');
  }
  throw HttpErrors.notFound('Practice Assistant route not found');
}
