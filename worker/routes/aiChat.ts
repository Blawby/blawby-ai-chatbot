import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth } from '../middleware/auth.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { createAiClient } from '../utils/aiClient.js';
import { fetchPracticeDetailsWithCache } from '../utils/practiceDetailsCache.js';

const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const LEGAL_DISCLAIMER = 'I’m not a lawyer and can’t provide legal advice, but I can help you request a consultation with this practice.';

export async function handleAiChat(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api' || segments[1] !== 'ai' || segments[2] !== 'chat') {
    throw HttpErrors.notFound('Endpoint not found');
  }

  const authContext = await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required');
  }

  const body = await parseJsonBody(request) as {
    conversationId?: string;
    practiceSlug?: string;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!body.conversationId || typeof body.conversationId !== 'string') {
    throw HttpErrors.badRequest('conversationId is required');
  }
  if (!body.practiceSlug || typeof body.practiceSlug !== 'string') {
    throw HttpErrors.badRequest('practiceSlug is required');
  }
  if (!Array.isArray(body.messages)) {
    throw HttpErrors.badRequest('messages must be an array');
  }
  const invalidMessage = body.messages.find((message) => (
    !message ||
    (message.role !== 'user' && message.role !== 'assistant') ||
    typeof message.content !== 'string'
  ));
  if (invalidMessage) {
    throw HttpErrors.badRequest('messages must include role and content');
  }

  const conversationService = new ConversationService(env);
  const conversation = await conversationService.getConversationById(body.conversationId);
  if (!conversation.participants.includes(authContext.user.id)) {
    throw HttpErrors.forbidden('User is not a participant in this conversation');
  }

  const auditService = new SessionAuditService(env);
  await auditService.createEvent({
    conversationId: body.conversationId,
    eventType: 'ai_message_sent',
    actorType: 'user',
    actorId: authContext.user.id,
    payload: { conversationId: body.conversationId }
  });

  const { details, isPublic } = await fetchPracticeDetailsWithCache(env, request, body.practiceSlug);
  if (!details || !isPublic) {
    const reply = 'I don’t have access to this practice’s details right now. Please click “Request consultation” to connect with the practice.';
    await auditService.createEvent({
      conversationId: body.conversationId,
      eventType: 'ai_message_received',
      actorType: 'system',
      payload: { conversationId: body.conversationId }
    });
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const aiClient = createAiClient(env);
  const response = await aiClient.requestChatCompletions({
    model: env.AI_MODEL || DEFAULT_AI_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: [
          'You are an intake assistant for a law practice website.',
          'You may answer only operational questions using provided practice details.',
          `If user asks for legal advice: respond with the exact sentence: "${LEGAL_DISCLAIMER}" and recommend consultation.`,
          'Ask only ONE clarifying question max per assistant message.',
          'If you don’t have practice details: say you don’t have access and recommend consultation.',
        ].join('\n')
      },
      {
        role: 'system',
        content: `PRACTICE_CONTEXT: ${JSON.stringify(details)}`
      },
      ...body.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ]
  });

  if (!response.ok) {
    throw HttpErrors.internalServerError('AI request failed');
  }

  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  } | null;

  const rawReply = payload?.choices?.[0]?.message?.content;
  const reply = typeof rawReply === 'string' ? rawReply : '';

  await auditService.createEvent({
    conversationId: body.conversationId,
    eventType: 'ai_message_received',
    actorType: 'system',
    payload: { conversationId: body.conversationId }
  });

  return new Response(JSON.stringify({ reply }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
