import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth } from '../middleware/auth.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { createAiClient } from '../utils/aiClient.js';

const DEFAULT_AI_MODEL = 'gpt-4o-mini';

type IntentResult = {
  intent: 'ASK_QUESTION' | 'REQUEST_CONSULTATION' | 'UNCLEAR';
  confidence: number;
  reason: string;
};

const fallbackIntent: IntentResult = {
  intent: 'UNCLEAR',
  confidence: 0,
  reason: 'parse_failed'
};

const safeParseIntent = (raw: string): IntentResult => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const intent = parsed.intent;
    const confidence = parsed.confidence;
    const reason = parsed.reason;
    if (
      (intent === 'ASK_QUESTION' || intent === 'REQUEST_CONSULTATION' || intent === 'UNCLEAR') &&
      typeof confidence === 'number' &&
      typeof reason === 'string'
    ) {
      return { intent, confidence, reason };
    }
    return fallbackIntent;
  } catch {
    return fallbackIntent;
  }
};

export async function handleAiIntent(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api' || segments[1] !== 'ai' || segments[2] !== 'intent') {
    throw HttpErrors.notFound('Endpoint not found');
  }

  const authContext = await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required');
  }

  const body = await parseJsonBody(request) as {
    conversationId?: string;
    practiceSlug?: string;
    message?: string;
  };

  if (!body.conversationId || typeof body.conversationId !== 'string') {
    throw HttpErrors.badRequest('conversationId is required');
  }
  if (!body.practiceSlug || typeof body.practiceSlug !== 'string') {
    throw HttpErrors.badRequest('practiceSlug is required');
  }
  if (!body.message || typeof body.message !== 'string') {
    throw HttpErrors.badRequest('message is required');
  }

  const conversationService = new ConversationService(env);
  const conversation = await conversationService.getConversationById(body.conversationId);
  if (!conversation.participants.includes(authContext.user.id)) {
    throw HttpErrors.forbidden('User is not a participant in this conversation');
  }

  const aiClient = createAiClient(env);
  const response = await aiClient.requestChatCompletions({
    model: env.AI_MODEL || DEFAULT_AI_MODEL,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: [
          'Return only a single JSON object matching schema: intent, confidence, reason.',
          'No markdown. No prose.',
          'Classification rules:',
          'REQUEST_CONSULTATION: explicitly asks to consult/hire/book/appointment/representation/lawyer review/payment.',
          'ASK_QUESTION: asks operational questions or general info without explicitly requesting consultation.',
          'UNCLEAR: greeting, too short, ambiguous.'
        ].join('\n')
      },
      {
        role: 'user',
        content: body.message
      }
    ]
  });

  let result = fallbackIntent;
  if (response.ok) {
    const payload = await response.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    } | null;

    const content = payload?.choices?.[0]?.message?.content ?? '';
    result = safeParseIntent(typeof content === 'string' ? content : '');
  }

  const auditService = new SessionAuditService(env);
  await auditService.createEvent({
    conversationId: body.conversationId,
    eventType: 'intent_classified',
    actorType: 'system',
    payload: {
      intent: result.intent,
      confidence: result.confidence,
      reason: result.reason
    }
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
