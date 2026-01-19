import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth } from '../middleware/auth.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { createAiClient } from '../utils/aiClient.js';
import { fetchPracticeDetailsWithCache } from '../utils/practiceDetailsCache.js';
import { Logger } from '../utils/logger.js';

const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const LEGAL_DISCLAIMER = 'I’m not a lawyer and can’t provide legal advice, but I can help you request a consultation with this practice.';
const EMPTY_REPLY_FALLBACK = 'I wasn\'t able to generate a response. Please try again or click "Request consultation" to connect with the practice.';
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_LENGTH = 12000;

const shouldRequireDisclaimer = (messages: Array<{ role: 'user' | 'assistant'; content: string }>): boolean => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return false;
  return /\b(legal advice|should I|can I sue|lawsuit|sue|liable|liability|contract dispute|criminal|charged|settlement|custody|divorce|immigration)\b/i.test(
    lastUserMessage.content
  );
};

const countQuestions = (text: string): number => (text.match(/\?/g) || []).length;

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
  if (body.messages.length > MAX_MESSAGES) {
    throw HttpErrors.badRequest(`messages exceeds limit of ${MAX_MESSAGES}`);
  }
  const totalLength = body.messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalLength > MAX_TOTAL_LENGTH) {
    throw HttpErrors.badRequest(`messages total length exceeds ${MAX_TOTAL_LENGTH} characters`);
  }
  const oversizeMessage = body.messages.find((message) => message.content.length > MAX_MESSAGE_LENGTH);
  if (oversizeMessage) {
    throw HttpErrors.badRequest(`message content exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  const conversationService = new ConversationService(env);
  const conversation = await conversationService.getConversationById(body.conversationId);
  if (!conversation) {
    throw HttpErrors.notFound('Conversation not found');
  }
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
  let reply: string;

  if (!details || !isPublic) {
    reply = 'I don’t have access to this practice’s details right now. Please click “Request consultation” to connect with the practice.';
  } else {
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
    reply = typeof rawReply === 'string' && rawReply.trim() !== ''
      ? rawReply
      : EMPTY_REPLY_FALLBACK;
    if (reply === EMPTY_REPLY_FALLBACK) {
      Logger.warn('AI response missing or empty', {
        conversationId: body.conversationId,
        rawReplyType: typeof rawReply
      });
    } else {
      const violations: string[] = [];
      if (shouldRequireDisclaimer(body.messages) && !reply.includes(LEGAL_DISCLAIMER)) {
        violations.push('missing_disclaimer');
      }
      if (countQuestions(reply) > 1) {
        violations.push('too_many_questions');
      }
      if (violations.length > 0) {
        Logger.warn('AI response violated prompt contract', {
          conversationId: body.conversationId,
          rawReplyType: typeof rawReply,
          violations
        });
        reply = EMPTY_REPLY_FALLBACK;
      }
    }
  }

  const storedMessage = await conversationService.sendSystemMessage({
    conversationId: body.conversationId,
    practiceId: conversation.practice_id,
    content: reply,
    metadata: {
      source: 'ai',
      model: env.AI_MODEL || DEFAULT_AI_MODEL
    }
  });

  await auditService.createEvent({
    conversationId: body.conversationId,
    eventType: 'ai_message_received',
    actorType: 'system',
    payload: { conversationId: body.conversationId }
  });

  return new Response(JSON.stringify({ reply, message: storedMessage }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
