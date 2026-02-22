import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth } from '../middleware/auth.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { createAiClient } from '../utils/aiClient.js';
import { fetchPracticeDetailsWithCache } from '../utils/practiceDetailsCache.js';
import { Logger } from '../utils/logger.js';

const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const LEGAL_DISCLAIMER = 'I\'m not a lawyer and can\'t provide legal advice, but I can help you request a consultation with this practice.';
const EMPTY_REPLY_FALLBACK = 'I wasn\'t able to generate a response. Please try again or click "Request consultation" to connect with the practice.';
const INTRO_INTAKE_DISCLAIMER_FALLBACK = "I cannot provide legal advice, but I can help you submit a consultation request. Please describe your situation so I can gather the necessary details for the firm.";
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOTAL_LENGTH = 12000;
const AI_TIMEOUT_MS = 8000;
const CONSULTATION_CTA_REGEX = /\b(request(?:ing)?|schedule|book)\s+(a\s+)?consultation\b/i;
const SERVICE_QUESTION_REGEX = /(?:\b(?:do you|are you|can you|what|which)\b.*\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b|\b(services?|practice (?:area|areas)|specializ(?:e|es) in|personal injury)\b.*\?)/i;
const HOURS_QUESTION_REGEX = /\b(hours?|opening hours|business hours|office hours|when are you open)\b/i;
const LEGAL_INTENT_REGEX = /\b(?:legal advice|what are my rights|is it legal|do i need (?:a )?lawyer|(?:should|can|could|would)\s+i\b.*\b(?:sue|lawsuit|liable|liability|contract dispute|charged|settlement|custody|divorce|immigration|criminal)\b)/i;
const SUBMIT_AFFIRMATION_REGEX = /^\s*(?:yes|yeah|yep|sure|ok|okay|go ahead|submit|do it|lets go|let's go|ready)\s*[.!]?\s*$/i;

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const readStringField = (record: Record<string, unknown> | null, key: string): string | null => {
  if (!record) return null;
  const value = record[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const hasNonEmptyStringField = (record: Record<string, unknown> | null | undefined, key: string): boolean => {
  if (!record) return false;
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0;
};

const mergeIntakeState = (
  base: Record<string, unknown> | null,
  patch: Record<string, unknown> | null
): Record<string, unknown> | null => {
  if (!base && !patch) return null;
  return { ...(base ?? {}), ...(patch ?? {}) };
};

const shouldShowDeterministicIntakeCta = (state: Record<string, unknown> | null): boolean => {
  if (!state) return false;
  const caseStrength = typeof state.caseStrength === 'string' ? state.caseStrength : null;
  if (caseStrength !== 'developing' && caseStrength !== 'strong') return false;

  // Core intake readiness for showing CTA actions. This intentionally does not
  // require every optional field; it only ensures we have enough context to
  // offer "continue now" vs "build stronger brief".
  const hasDescription = hasNonEmptyStringField(state, 'description');
  const hasLocation = hasNonEmptyStringField(state, 'city') && hasNonEmptyStringField(state, 'state');
  const hasOpposingParty = hasNonEmptyStringField(state, 'opposingParty');
  const hasDesiredOutcome = hasNonEmptyStringField(state, 'desiredOutcome');
  return hasDescription && hasLocation && hasOpposingParty && hasDesiredOutcome;
};

const normalizeApostrophes = (text: string): string => text.replace(/['']/g, '\'');

const shouldRequireDisclaimer = (messages: Array<{ role: 'user' | 'assistant'; content: string }>): boolean => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return false;
  return LEGAL_INTENT_REGEX.test(lastUserMessage.content);
};

const countQuestions = (text: string): number => (text.match(/\?/g) || []).length;

const buildIntakeFallbackReply = (fields: Record<string, unknown> | null): string => {
  if (!fields) return 'Thanks — can you share a bit more about what happened?';
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
  return 'Would you like to continue now, or build a stronger brief first so we can match you with the right attorney?';
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
  return /(are you ready to submit|ready to submit|submit your request|submit this|submit this information|submit your consultation|connect you with the right attorney|would you like to submit|would you like to continue now)/i.test(reply);
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
    if (next !== undefined) normalized.consultation_fee = next;
  }
  if ('consultationFee' in normalized) {
    const next = normalizeMoney(normalized.consultationFee);
    if (next !== undefined) normalized.consultationFee = next;
  }
  if ('payment_link_prefill_amount' in normalized) {
    const next = normalizeMoney(normalized.payment_link_prefill_amount);
    if (next !== undefined) normalized.payment_link_prefill_amount = next;
  }
  if ('paymentLinkPrefillAmount' in normalized) {
    const next = normalizeMoney(normalized.paymentLinkPrefillAmount);
    if (next !== undefined) normalized.paymentLinkPrefillAmount = next;
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
        urgency: { type: 'string', enum: ['routine', 'time_sensitive', 'emergency'] },
        opposingParty: { type: 'string', description: 'Name or description of the opposing party if mentioned' },
        city: { type: 'string' },
        state: { type: 'string', description: '2-letter US state code' },
        postalCode: { type: 'string' },
        country: { type: 'string' },
        addressLine1: { type: 'string' },
        addressLine2: { type: 'string' },
        desiredOutcome: { type: 'string', description: 'What the user wants to achieve, max 150 chars' },
        courtDate: { type: 'string', description: 'Any known court date or deadline in plain text' },
        income: { type: 'string', description: 'Monthly or yearly income if mentioned' },
        householdSize: { type: 'number', description: 'Number of people in the household' },
        hasDocuments: { type: 'boolean', description: 'Whether the user has mentioned having relevant documents' },
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
        caseStrength: { type: 'string', enum: ['needs_more_info', 'developing', 'strong'] },
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

  return `You are a warm, helpful legal intake assistant for this law firm. Your job is to understand someone's legal situation so they can be connected with the right attorney.

This firm handles the following practice areas only:
${serviceList}

Conversation style:
- Be warm, human, and concise — like a knowledgeable friend, not a form
- Ask ONE focused question at a time
- Never give legal advice
- Never ask for personal contact info (name, email, phone) — that's already collected
- Only identify practice areas from the list above

Your goal through the conversation is to naturally learn:
1. What is happening (in their words) — ask this first, openly
2. Which practice area applies
3. Their city and state — weave this in naturally ("Just so we can match you with someone local — what city and state are you in?")
4. Whether there's an opposing party — ask naturally if relevant ("Is there another party involved, like a person, company, or employer?")
5. Any time pressure or deadlines
6. What outcome they're hoping for

Do NOT ask for all of this at once. Follow the natural thread of the conversation. Once you know what's happening, ask for one missing piece at a time.

After every user message, call update_intake_fields with everything you've learned so far, your caseStrength assessment, and missingSummary.

caseStrength rules:
- needs_more_info: practice area unknown OR description is fewer than 10 words
- developing: practice area known + description has substance, but city/state OR opposing party are still unknown
- strong: practice area known + description 20+ words + city and state known + at least one of (opposing party OR desired outcome OR urgency) known

When caseStrength is "developing" or "strong", end your message with a brief summary of what you've collected and ask if they're ready to submit.

If the user says "yes", "sure", "go ahead", "ready", or similar in response to your ready-to-submit question, do NOT ask another intake question. Confirm they can submit now.

missingSummary: always set this when caseStrength is "needs_more_info" or "developing". One plain sentence saying what's missing.

Hard limit: after 8 user messages, set caseStrength to at minimum "developing" and show the summary regardless.`;
};

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/**
 * Encode a single SSE event as bytes.
 * We use a single `data:` line containing JSON so the client can parse each
 * event with one JSON.parse call without needing to track event names.
 */
function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Build an SSE Response with the correct headers for Cloudflare Workers.
 * The transform stream lets us write events from a separate async task while
 * the response is already streaming to the client.
 */
function createSseResponse(): {
  response: Response;
  write: (payload: Record<string, unknown>) => void;
  close: () => void;
} {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  return {
    response: new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // Prevent Cloudflare from buffering the stream
        'X-Accel-Buffering': 'no',
      },
    }),
    write(payload) {
      // Fire-and-forget — if the client disconnected the write will silently fail
      writer.write(sseEvent(payload)).catch(() => {});
    },
    close() {
      writer.close().catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleAiChat(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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

  const conversationMetadata = isRecord(conversation.user_info) ? conversation.user_info : null;
  const storedMode = typeof conversationMetadata?.mode === 'string' ? conversationMetadata.mode : null;
  const effectiveMode = body.mode ?? storedMode;
  const storedIntakeState = isRecord(conversationMetadata?.intakeConversationState)
    ? conversationMetadata.intakeConversationState as Record<string, unknown>
    : null;
  const slimDraft = isRecord(conversationMetadata?.intakeSlimContactDraft)
    ? conversationMetadata.intakeSlimContactDraft as Record<string, unknown>
    : null;
  const hasSlimContactDraft = Boolean(
    slimDraft && (
      hasNonEmptyStringField(slimDraft, 'name') ||
      hasNonEmptyStringField(slimDraft, 'email') ||
      hasNonEmptyStringField(slimDraft, 'phone')
    )
  );
  const intakeBriefActive = conversationMetadata?.intakeAiBriefActive === true;
  const isIntakeMode = Boolean(
    (effectiveMode === 'REQUEST_CONSULTATION' || hasSlimContactDraft || intakeBriefActive) &&
    body.intakeSubmitted !== true &&
    isPublic
  );
  const shouldSkipPracticeValidation = authContext.isAnonymous === true || isPublic;

  const lastUserMessage = [...body.messages].reverse().find((message) => message.role === 'user');
  const lastAssistantMessage = [...body.messages].reverse().find((message) => message.role === 'assistant');
  const serviceNames = extractServiceNames(details);
  const hasLegalIntent = Boolean(lastUserMessage && LEGAL_INTENT_REGEX.test(lastUserMessage.content));
  const intakeReadyByState = isIntakeMode && shouldShowDeterministicIntakeCta(storedIntakeState);

  // ------------------------------------------------------------------
  // Short-circuit paths — instant replies that don't need streaming.
  // These return a JSON response identical to the old format so any
  // legacy client code that hasn't been updated yet still works.
  // ------------------------------------------------------------------

  let shortCircuitReply: string | null = null;
  let shortCircuitIntakeReadyCta = false;

  if (!details || !isPublic) {
    shortCircuitReply = 'I don\'t have access to this practice\'s details right now. Please click "Request consultation" to connect with the practice.';
  } else if (
    isIntakeMode &&
    intakeReadyByState &&
    lastUserMessage &&
    lastAssistantMessage &&
    SUBMIT_AFFIRMATION_REGEX.test(lastUserMessage.content) &&
    shouldShowIntakeCtaForReply(lastAssistantMessage.content)
  ) {
    shortCircuitReply = 'Great. You can submit your request now, or build a stronger brief first before we send it to the practice.';
    shortCircuitIntakeReadyCta = true;
  } else if (lastUserMessage && HOURS_QUESTION_REGEX.test(lastUserMessage.content)) {
    const phone = readStringField(details, 'business_phone') ?? readStringField(details, 'businessPhone');
    const email = readStringField(details, 'business_email') ?? readStringField(details, 'businessEmail');
    const website = readStringField(details, 'website');
    const contactParts = [phone ? `phone: ${phone}` : null, email ? `email: ${email}` : null, website ? `website: ${website}` : null]
      .filter((value): value is string => Boolean(value));
    shortCircuitReply = contactParts.length > 0
      ? `The practice has not published specific office hours here yet. You can contact them via ${contactParts.join(', ')}.`
      : 'The practice has not published specific office hours here yet. Please click "Request consultation" to connect with the practice.';
  } else if (!isIntakeMode && hasLegalIntent) {
    shortCircuitReply = LEGAL_DISCLAIMER;
  } else if (!isIntakeMode && lastUserMessage && SERVICE_QUESTION_REGEX.test(lastUserMessage.content) && serviceNames.length > 0) {
    const normalizedQuestion = normalizeText(lastUserMessage.content);
    const matchedService = serviceNames.find((service) => normalizedQuestion.includes(normalizeText(service)));
    shortCircuitReply = matchedService
      ? `Yes — we handle ${matchedService}. Would you like to request a consultation?`
      : `We currently handle ${formatServiceList(serviceNames)}. Would you like to request a consultation?`;
  }

  if (shortCircuitReply !== null) {
    const shouldPromptConsultation =
      !hasSlimContactDraft &&
      (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(shortCircuitReply));
    const shortCircuitShouldShowIntakeCta =
      isIntakeMode &&
      (
        shortCircuitIntakeReadyCta ||
        (
          intakeReadyByState &&
          shouldShowIntakeCtaForReply(shortCircuitReply)
        )
      );

    const storedMessage = await conversationService.sendSystemMessage({
      conversationId: body.conversationId,
      practiceId: conversation.practice_id,
      content: shortCircuitReply,
      metadata: {
        source: 'ai',
        model: env.AI_MODEL || DEFAULT_AI_MODEL,
        ...(shortCircuitShouldShowIntakeCta ? { intakeReadyCta: true } : {}),
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

    return new Response(
      JSON.stringify({ reply: shortCircuitReply, message: storedMessage, intakeFields: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ------------------------------------------------------------------
  // Streaming path — calls OpenAI with stream:true, pipes tokens to the
  // client via SSE, then persists the completed message via waitUntil.
  // ------------------------------------------------------------------

  const aiDetails = normalizePracticeDetailsForAi(details);
  const aiClient = createAiClient(env);
  let model = env.AI_MODEL || DEFAULT_AI_MODEL;
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
        'If you don\'t have practice details: say you don\'t have access and recommend consultation.',
      ].join('\n');

  const requestPayload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `PRACTICE_CONTEXT: ${JSON.stringify(aiDetails)}` },
      ...body.messages.map((message) => ({ role: message.role, content: message.content }))
    ]
  };

  // Intake mode uses tool_choice — OpenAI supports streaming with tools,
  // but the tool call arguments arrive in chunks too. We accumulate them
  // separately and only emit the done event once the full tool call is parsed.
  if (isIntakeMode) {
    requestPayload.tools = [INTAKE_TOOL];
    requestPayload.tool_choice = 'auto';
  }

  const { response: sseResponse, write, close } = createSseResponse();

  // Kick off the async work and register it with ctx.waitUntil so Cloudflare
  // does not terminate the worker before persistence completes.
  const streamAndPersist = async () => {
    let accumulatedReply = '';
    let intakeFields: Record<string, unknown> | null = null;
    let quickReplies: string[] | null = null;

    try {
      const aiResponse = await Promise.race([
        aiClient.requestChatCompletions(requestPayload),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS)
        )
      ]).catch((error: unknown) => {
        Logger.warn('AI request timed out or failed', {
          conversationId: body.conversationId,
          reason: error instanceof Error ? error.message : String(error)
        });
        return null;
      });

      if (!aiResponse || !aiResponse.ok || !aiResponse.body) {
        // Emit a fallback reply as a single token so the client still gets something
        const fallback = isIntakeMode ? buildIntakeFallbackReply(null) : EMPTY_REPLY_FALLBACK;
        accumulatedReply = fallback;
        write({ token: fallback });
      } else {
        // Read the SSE stream from OpenAI and re-emit each token to our client.
        // OpenAI streams newline-delimited `data: {...}` events.
        const reader = aiResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Accumulate tool call argument chunks separately
        let toolCallName = '';
        let toolCallArgBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            let chunk: {
              choices?: Array<{
                delta?: {
                  content?: string | null;
                  tool_calls?: Array<{
                    index?: number;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
            };

            try {
              chunk = JSON.parse(trimmed.slice(6));
            } catch {
              continue;
            }

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            // Text token
            if (typeof delta.content === 'string' && delta.content.length > 0) {
              accumulatedReply += delta.content;
              write({ token: delta.content });
            }

            // Tool call argument chunk (intake mode)
            if (delta.tool_calls?.[0]) {
              const tc = delta.tool_calls[0];
              if (tc.function?.name) {
                toolCallName = tc.function.name;
              }
              if (typeof tc.function?.arguments === 'string') {
                toolCallArgBuffer += tc.function.arguments;
              }
            }
          }
        }

        // Flush any remaining buffer content
        if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
          try {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data: ')) {
              const chunk = JSON.parse(trimmed.slice(6)) as { choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: string } }> } }> };
              const token = chunk.choices?.[0]?.delta?.content;
              if (typeof token === 'string' && token.length > 0) {
                accumulatedReply += token;
                write({ token });
              }
              // Handle tool calls in final buffer
              const toolCalls = chunk.choices?.[0]?.delta?.tool_calls;
              if (Array.isArray(toolCalls)) {
                for (const tc of toolCalls) {
                  if (typeof tc.function?.name === 'string') {
                    toolCallName = tc.function.name;
                  }
                  if (typeof tc.function?.arguments === 'string') {
                    toolCallArgBuffer += tc.function.arguments;
                  }
                }
              }
            }
          } catch {
            // ignore malformed final chunk
          }
        }

        // Parse accumulated tool call if present
        if (toolCallName === 'update_intake_fields' && toolCallArgBuffer.length > 0) {
          try {
            intakeFields = JSON.parse(toolCallArgBuffer) as Record<string, unknown>;
          } catch (error) {
            Logger.warn('Failed to parse streamed intake tool arguments', {
              conversationId: body.conversationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      // Post-process reply — same validation logic as the non-streaming path
      if (!accumulatedReply.trim()) {
        accumulatedReply = isIntakeMode && intakeFields
          ? buildIntakeFallbackReply(intakeFields)
          : EMPTY_REPLY_FALLBACK;
      }

      if (accumulatedReply !== EMPTY_REPLY_FALLBACK) {
        const violations: string[] = [];
        if (
          shouldRequireDisclaimer(body.messages) &&
          !normalizeApostrophes(accumulatedReply).toLowerCase().includes(normalizeApostrophes(LEGAL_DISCLAIMER).toLowerCase())
        ) {
          violations.push('missing_disclaimer');
        }
        if (!isIntakeMode && countQuestions(accumulatedReply) > 1) {
          violations.push('too_many_questions');
        }
        if (violations.length > 0) {
          Logger.warn('AI response violated prompt contract', {
            conversationId: body.conversationId,
            violations
          });
          if (violations.includes('missing_disclaimer')) {
            accumulatedReply = isIntakeMode ? INTRO_INTAKE_DISCLAIMER_FALLBACK : EMPTY_REPLY_FALLBACK;
          } else if (!isIntakeMode) {
            accumulatedReply = EMPTY_REPLY_FALLBACK;
          }
        }
      }

      // Extract quickReplies from intakeFields before persisting
      if (intakeFields && Array.isArray(intakeFields.quickReplies)) {
        quickReplies = (intakeFields.quickReplies as unknown[])
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
          .slice(0, 3);
        if (quickReplies.length === 0) quickReplies = null;
      }
      if (intakeFields && 'quickReplies' in intakeFields) {
        const { quickReplies: _q, ...rest } = intakeFields as Record<string, unknown>;
        intakeFields = rest;
      }
      if (intakeFields && typeof intakeFields.practiceArea === 'string') {
        const matched = servicesForPrompt.find((s) => s.key === intakeFields?.practiceArea);
        if (matched) intakeFields.practiceAreaName = matched.name;
      }
      const mergedIntakeState = mergeIntakeState(storedIntakeState, intakeFields);

      const shouldPromptConsultation =
        !hasSlimContactDraft &&
        (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(accumulatedReply));

      const intakeCaseStrength = typeof intakeFields?.caseStrength === 'string'
        ? intakeFields.caseStrength
        : null;
      const shouldShowIntakeCta =
        isIntakeMode &&
        (
          shouldShowDeterministicIntakeCta(mergedIntakeState)
          || (
            (intakeCaseStrength === 'developing' || intakeCaseStrength === 'strong') &&
            shouldShowIntakeCtaForReply(accumulatedReply)
          )
        );

      // Emit the done event before persisting — client can act on intakeFields
      // immediately without waiting for the DB write
      write({
        done: true,
        intakeFields: intakeFields ?? null,
        quickReplies: quickReplies ?? null,
      });

      // Persist and audit — runs inside waitUntil so the worker stays alive
      // until this completes even after the SSE stream is closed
      const storedMessage = await conversationService.sendSystemMessage({
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        content: accumulatedReply,
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

      if (storedMessage) {
        // Persist the merged intake state back to the conversation metadata
        // so that it persists across devices/refreshes.
        if (isIntakeMode && mergedIntakeState) {
          try {
            await conversationService.updateConversation(body.conversationId, conversation.practice_id, {
              metadata: {
                ...conversationMetadata,
                intakeConversationState: mergedIntakeState
              }
            });
          } catch (metadataError) {
            Logger.warn('Failed to persist merged intake state to conversation metadata', {
              conversationId: body.conversationId,
              error: metadataError instanceof Error ? metadataError.message : String(metadataError)
            });
          }
        }

        // Send the persisted message ID so the client can reconcile the
        // temporary streaming bubble with the real message when it arrives
        // via WebSocket message.new
        write({ persisted: true, messageId: storedMessage.id });
      }

      await auditService.createEvent({
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        eventType: 'ai_message_received',
        actorType: 'system',
        payload: { conversationId: body.conversationId }
      });

    } catch (error) {
      Logger.warn('Streaming AI handler error', {
        conversationId: body.conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
      write({ error: true, message: EMPTY_REPLY_FALLBACK });
    } finally {
      close();
    }
  };

  if (ctx) {
    ctx.waitUntil(streamAndPersist());
  } else {
    // Fallback for environments without ExecutionContext (tests, local dev without miniflare)
    streamAndPersist().catch((error) => {
      Logger.warn('streamAndPersist uncaught error', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return sseResponse;
}
