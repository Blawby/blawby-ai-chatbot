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
const INTRO_INTAKE_DISCLAIMER_FALLBACK = "I cannot provide legal advice, but I can help you submit a consultation request. Please describe your situation so I can gather the necessary details for the firm.";
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_LENGTH = 12000;
const AI_TIMEOUT_MS = 8000;
const CONSULTATION_CTA_REGEX = /\b(request(?:ing)?|schedule|book)\s+(a\s+)?consultation\b/i;
const SERVICE_QUESTION_REGEX = /(?:\b(?:do you|are you|can you|what|which)\b.*\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b|\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b.*\?)/i;
const LEGAL_INTENT_REGEX = /\b(?:legal advice|what are my rights|is it legal|do i need (?:a )?lawyer|(?:should|can|could|would)\s+i\b.*\b(?:sue|lawsuit|liable|liability|contract dispute|charged|settlement|custody|divorce|immigration|criminal)\b)/i;

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const extractServiceNames = (details: Record<string, unknown> | null): string[] => {
  if (!details) return [];
  const services = details.services;
  if (!Array.isArray(services)) return [];
  return services
    .map((service) => (typeof service?.name === 'string' ? service.name.trim() : ''))
    .filter((name) => name.length > 0);
};

const normalizeServicesForPrompt = (
  details: Record<string, unknown> | null
): Array<{ name: string; key: string }> => {
  if (!details) return [];
  const services = details.services;
  if (!Array.isArray(services)) return [];
  return services
    .map((service) => {
      if (!service || typeof service !== 'object') return null;
      const record = service as Record<string, unknown>;
      const name = typeof record.name === 'string'
        ? record.name.trim()
        : typeof record.title === 'string'
          ? record.title.trim()
          : '';
      const key = typeof record.key === 'string'
        ? record.key.trim()
        : typeof record.service_key === 'string'
          ? record.service_key.trim()
          : '';
      if (!name) return null;
      return { name, key: key || name.toUpperCase().replace(/[^A-Z0-9]+/g, '_') };
    })
    .filter((service): service is { name: string; key: string } => Boolean(service));
};

const formatServiceList = (names: string[]): string => {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more`;
};

const normalizeApostrophes = (text: string): string => text.replace(/[’']/g, '\'');

const shouldRequireDisclaimer = (messages: Array<{ role: 'user' | 'assistant'; content: string }>): boolean => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return false;
  return LEGAL_INTENT_REGEX.test(lastUserMessage.content);
};

const countQuestions = (text: string): number => (text.match(/\?/g) || []).length;

const buildIntakeFallbackReply = (fields: Record<string, unknown> | null): string => {
  if (!fields) {
    return 'Thanks — can you share a bit more about what happened?';
  }
  if (typeof fields.practiceArea !== 'string' || fields.practiceArea.trim() === '') {
    return 'Which practice area best fits your situation?';
  }
  if (typeof fields.description !== 'string' || fields.description.trim() === '') {
    return 'Can you describe what happened in your own words?';
  }
  if (!fields.urgency && !fields.courtDate) {
    return 'Are there any upcoming deadlines or court dates?';
  }
  if (typeof fields.opposingParty !== 'string' || fields.opposingParty.trim() === '') {
    return 'Is there an opposing party involved?';
  }
  if (typeof fields.desiredOutcome !== 'string' || fields.desiredOutcome.trim() === '') {
    return 'What outcome are you hoping for?';
  }
  if (typeof fields.city !== 'string' || fields.city.trim() === '' || typeof fields.state !== 'string' || fields.state.trim() === '') {
    return 'What city and state are you in?';
  }
  if (typeof fields.hasDocuments !== 'boolean') {
    return 'Do you have any documents related to this situation?';
  }
  return 'Would you like to sign up now, or build a stronger brief first so we can match you with the right attorney?';
};

const shouldShowIntakeCtaForReply = (reply: string): boolean => {
  const normalized = reply.toLowerCase();
  if (
    normalized.includes("here's what we have so far") ||
    normalized.includes('here is what we have so far') ||
    normalized.includes('summary') ||
    normalized.includes('summarize')
  ) {
    return true;
  }
  return /(are you ready to submit|ready to submit|submit your request|submit this|submit this information|submit your consultation|connect you with the right attorney|would you like to submit)/i.test(reply);
};

const normalizePracticeDetailsForAi = (details: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!details) return null;
  const normalized = { ...details };
  const normalizeMoney = (value: unknown): number | null | undefined => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return value / 100;
  };
  if ('consultation_fee' in normalized) {
    const next = normalizeMoney(normalized.consultation_fee);
    if (next !== undefined) {
      normalized.consultation_fee = next;
    }
  }
  if ('consultationFee' in normalized) {
    const next = normalizeMoney(normalized.consultationFee);
    if (next !== undefined) {
      normalized.consultationFee = next;
    }
  }
  if ('payment_link_prefill_amount' in normalized) {
    const next = normalizeMoney(normalized.payment_link_prefill_amount);
    if (next !== undefined) {
      normalized.payment_link_prefill_amount = next;
    }
  }
  if ('paymentLinkPrefillAmount' in normalized) {
    const next = normalizeMoney(normalized.paymentLinkPrefillAmount);
    if (next !== undefined) {
      normalized.paymentLinkPrefillAmount = next;
    }
  }
  return normalized;
};

const INTAKE_TOOL = {
  type: 'function',
  function: {
    name: 'update_intake_fields',
    description: 'Extract structured intake fields from the conversation so far',
    parameters: {
      type: 'object',
      properties: {
        practiceArea: {
          type: 'string',
          description: 'The service key from the firm services list, e.g. FAMILY_LAW'
        },
        description: {
          type: 'string',
          description: 'Plain-English summary of the case, max 300 chars'
        },
        urgency: {
          type: 'string',
          enum: ['routine', 'time_sensitive', 'emergency']
        },
        opposingParty: {
          type: 'string',
          description: 'Name or description of the opposing party if mentioned'
        },
        city: { type: 'string' },
        state: { type: 'string', description: '2-letter US state code' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
        addressLine1: { type: 'string' },
        addressLine2: { type: 'string' },
        desiredOutcome: {
          type: 'string',
          description: 'What the user wants to achieve, max 150 chars'
        },
        courtDate: {
          type: 'string',
          description: 'Any known court date or deadline in plain text'
        },
        income: {
          type: 'string',
          description: 'Monthly or yearly income if mentioned'
        },
        householdSize: {
          type: 'number',
          description: 'Number of people in the household'
        },
        hasDocuments: {
          type: 'boolean',
          description: 'Whether the user has mentioned having relevant documents'
        },
        eligibilitySignals: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any income, household, or fee-related details mentioned'
        },
        quickReplies: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string' },
          description: '2-3 short suggested answers for predictable questions. Omit for open-ended questions.'
        },
        caseStrength: {
          type: 'string',
          enum: ['needs_more_info', 'developing', 'strong']
        },
        missingSummary: {
          type: 'string',
          description: 'Plain English — what would most improve case strength. Null if strong.'
        }
      },
      required: ['caseStrength']
    }
  }
} as const;

const buildIntakeSystemPrompt = (services: Array<{ name: string; key: string }>): string => {
  const serviceList = services.length > 0
    ? services.map((service) => `- ${service.name} (key: ${service.key})`).join('\n')
    : '- General intake (no service list provided)';

  return `You are a legal intake assistant. Your job is to help someone describe their legal situation clearly before connecting them with an attorney at this firm.

This firm handles the following practice areas only:
${serviceList}

Rules:
- Ask one focused question at a time
- Be warm, plain-spoken, and concise
- Never give legal advice
- Never ask for personal contact information (name, email, phone, or address — collected separately)
- Only suggest practice areas from the list above

Your goal is to understand:
1. What is happening in their own words
2. Which practice area applies (from the list above only)
3. Who the opposing party is, if any
4. Any deadlines, court dates, or time pressure
5. What outcome they are hoping for
6. Their city and state (for attorney matching)
7. Whether they have documents and any eligibility-related signals (income/household/fees)

After every user message, call update_intake_fields with everything extracted so far, your caseStrength assessment, and missingSummary if anything important is missing.

caseStrength rules:
- needs_more_info: practice area unknown OR description fewer than 10 words
- developing: practice area known + description has substance, but urgency AND (opposing party OR desired outcome) are both missing
- strong: practice area known + description 20+ words + urgency known + at least one of (opposing party OR desired outcome) known + city and state known

When caseStrength is "developing" or "strong", end your message with a bullet summary and ask if they are ready to submit. Do not show the summary before that threshold.

missingSummary is required whenever caseStrength is "needs_more_info" or "developing". It must always explain in one plain sentence what would most improve the assessment. Never leave it null below "strong".

Hard limit: after 8 user messages, set caseStrength to at minimum "developing" and show the summary regardless.`;
};

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
    mode?: 'ASK_QUESTION' | 'REQUEST_CONSULTATION';
    intakeSubmitted?: boolean;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!body.conversationId || typeof body.conversationId !== 'string') {
    throw HttpErrors.badRequest('conversationId is required');
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

  const practiceId = conversation.practice_id;
  if (!practiceId) {
    throw HttpErrors.badRequest('Conversation is missing practice context');
  }

  const auditService = new SessionAuditService(env);
  await auditService.createEvent({
    conversationId: body.conversationId,
    practiceId,
    eventType: 'ai_message_sent',
    actorType: 'user',
    actorId: authContext.user.id,
    payload: { conversationId: body.conversationId }
  });

  const practiceSlug = typeof body.practiceSlug === 'string' ? body.practiceSlug.trim() : '';
  const { details, isPublic } = await fetchPracticeDetailsWithCache(
    env,
    request,
    practiceId,
    practiceSlug || undefined
  );
  const isIntakeMode = body.mode === 'REQUEST_CONSULTATION' && body.intakeSubmitted !== true && isPublic;
  const shouldSkipPracticeValidation = authContext.isAnonymous === true || isPublic;
  let reply: string;
  let model = env.AI_MODEL || DEFAULT_AI_MODEL;
  let intakeFields: Record<string, unknown> | null = null;
  let quickReplies: string[] | null = null;

  const lastUserMessage = [...body.messages].reverse().find((message) => message.role === 'user');
  const serviceNames = extractServiceNames(details);
  const hasLegalIntent = Boolean(lastUserMessage && LEGAL_INTENT_REGEX.test(lastUserMessage.content));

  if (!details || !isPublic) {
    reply = 'I don’t have access to this practice’s details right now. Please click “Request consultation” to connect with the practice.';
  } else if (!isIntakeMode && hasLegalIntent) {
    reply = LEGAL_DISCLAIMER;
  } else if (!isIntakeMode && lastUserMessage && SERVICE_QUESTION_REGEX.test(lastUserMessage.content) && serviceNames.length > 0) {
    const normalizedQuestion = normalizeText(lastUserMessage.content);
    const matchedService = serviceNames.find((service) => normalizedQuestion.includes(normalizeText(service)));
    if (matchedService) {
      reply = `Yes — we handle ${matchedService}. Would you like to request a consultation?`;
    } else {
      reply = `We currently handle ${formatServiceList(serviceNames)}. Would you like to request a consultation?`;
    }
  } else {
    const aiDetails = normalizePracticeDetailsForAi(details);
    const aiClient = createAiClient(env);
    if (!env.AI_MODEL && aiClient.provider === 'cloudflare_gateway') {
      model = 'openai/gpt-4o-mini';
    }
    const servicesForPrompt = normalizeServicesForPrompt(details);
    const systemPrompt = isIntakeMode
      ? buildIntakeSystemPrompt(servicesForPrompt)
      : [
          'You are an intake assistant for a law practice website.',
          'You may answer only operational questions using provided practice details.',
          `If user asks for legal advice: respond with the exact sentence: "${LEGAL_DISCLAIMER}" and recommend consultation.`,
          'Ask only ONE clarifying question max per assistant message.',
          'If you don’t have practice details: say you don’t have access and recommend consultation.',
        ].join('\n');

    const requestPayload: Record<string, unknown> = {
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'system',
          content: `PRACTICE_CONTEXT: ${JSON.stringify(aiDetails)}`
        },
        ...body.messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      ]
    };
    if (isIntakeMode) {
      requestPayload.tools = [INTAKE_TOOL];
      requestPayload.tool_choice = 'auto';
    }
    const response = await Promise.race([
      aiClient.requestChatCompletions({
        ...requestPayload
      }),
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS);
      })
    ]).catch((error: unknown) => {
      Logger.warn('AI request timed out or failed', {
        conversationId: body.conversationId,
        reason: error instanceof Error ? error.message : String(error)
      });
      return null;
    });

    if (response && response.ok) {
      const payload = await response.json().catch(() => null) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
      } | null;

      const messagePayload = payload?.choices?.[0]?.message;
      const rawReply = messagePayload?.content;
      const toolCall = messagePayload?.tool_calls?.[0];
      if (toolCall?.function?.name === 'update_intake_fields' && typeof toolCall.function.arguments === 'string') {
        try {
          intakeFields = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch (error) {
          Logger.warn('Failed to parse intake tool response', {
            conversationId: body.conversationId,
            error: error instanceof Error ? error.message : String(error)
          });
          intakeFields = null;
        }
      }
      if (intakeFields && Array.isArray(intakeFields.quickReplies)) {
        quickReplies = intakeFields.quickReplies
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .slice(0, 3);
        if (quickReplies.length === 0) {
          quickReplies = null;
        }
      }
      if (intakeFields && 'quickReplies' in intakeFields) {
        const { quickReplies: _extracted, ...rest } = intakeFields as Record<string, unknown>;
        intakeFields = rest;
      }
      if (intakeFields && typeof intakeFields.practiceArea === 'string') {
        const matched = servicesForPrompt.find((service) => service.key === intakeFields?.practiceArea);
        if (matched) {
          intakeFields.practiceAreaName = matched.name;
        }
      }
      if (typeof rawReply === 'string' && rawReply.trim() !== '') {
        reply = rawReply;
      } else if (isIntakeMode && intakeFields) {
        reply = buildIntakeFallbackReply(intakeFields);
        Logger.warn('AI response missing or empty in intake mode', {
          conversationId: body.conversationId,
          rawReplyType: typeof rawReply
        });
      } else {
        reply = EMPTY_REPLY_FALLBACK;
        Logger.warn('AI response missing or empty', {
          conversationId: body.conversationId,
          rawReplyType: typeof rawReply
        });
      }
      if (reply !== EMPTY_REPLY_FALLBACK) {
        const violations: string[] = [];
        if (
          shouldRequireDisclaimer(body.messages) &&
          !normalizeApostrophes(reply).toLowerCase().includes(normalizeApostrophes(LEGAL_DISCLAIMER).toLowerCase())
        ) {
          violations.push('missing_disclaimer');
        }
        if (!isIntakeMode && countQuestions(reply) > 1) {
          violations.push('too_many_questions');
        }
        if (violations.length > 0) {
          Logger.warn('AI response violated prompt contract', {
            conversationId: body.conversationId,
            rawReplyType: typeof rawReply,
            violations
          });
          // If the violation is a missing disclaimer, always fallback regardless of intake mode.
          if (violations.includes('missing_disclaimer')) {
            reply = isIntakeMode ? INTRO_INTAKE_DISCLAIMER_FALLBACK : EMPTY_REPLY_FALLBACK;
          } else if (!isIntakeMode) {
            reply = EMPTY_REPLY_FALLBACK;
          }
        }
      }
    } else if (isIntakeMode) {
      reply = buildIntakeFallbackReply(null);
    } else {
      throw HttpErrors.internalServerError('AI request failed');
    }
  }

  const shouldPromptConsultation =
    shouldRequireDisclaimer(body.messages)
    || CONSULTATION_CTA_REGEX.test(reply);

  const intakeCaseStrength = typeof intakeFields?.caseStrength === 'string'
    ? intakeFields.caseStrength
    : null;
  const shouldShowIntakeCta = (intakeCaseStrength === 'developing' || intakeCaseStrength === 'strong')
    && shouldShowIntakeCtaForReply(reply);
  const storedMessage = await conversationService.sendSystemMessage({
    conversationId: body.conversationId,
    practiceId: conversation.practice_id,
    content: reply,
    metadata: {
      source: 'ai',
      model,
      ...(intakeFields ? { intakeFields } : {}),
      ...(quickReplies ? { quickReplies } : {}),
      ...(isIntakeMode && shouldShowIntakeCta ? { intakeReadyCta: true } : {}),
      ...(shouldPromptConsultation
        ? { modeSelector: { showAskQuestion: false, showRequestConsultation: true, source: 'ai' } }
        : {})
    },
    recipientUserId: authContext.user.id,
    skipPracticeValidation: shouldSkipPracticeValidation,
    request
  });

  await auditService.createEvent({
    conversationId: body.conversationId,
    practiceId: conversation.practice_id,
    eventType: 'ai_message_received',
    actorType: 'system',
    payload: { conversationId: body.conversationId }
  });

  return new Response(JSON.stringify({ reply, message: storedMessage, intakeFields }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
