import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError } from '../types.js';
import type { Env } from '../types.js';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { ConversationService } from '../services/ConversationService.js';
import { optionalAuth } from '../middleware/auth.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { createAiClient } from '../utils/aiClient.js';
import { fetchPracticeDetailsWithCache } from '../utils/practiceDetailsCache.js';
import { Logger } from '../utils/logger.js';
import { resolveConsultationState } from '../../src/shared/utils/consultationState';

import {
  DEFAULT_AI_MODEL,
  LEGAL_DISCLAIMER,
  MAX_MESSAGES,
  MAX_MESSAGE_LENGTH,
  MAX_TOTAL_LENGTH,
  AI_TIMEOUT_MS,
  CONSULTATION_CTA_REGEX,
  SERVICE_QUESTION_REGEX,
  HOURS_QUESTION_REGEX,
  LEGAL_INTENT_REGEX,
  createSseResponse,
  consumeAiStream,
  normalizeKeys,
  createAiDebugError,
  isRecord,
  readStringField,
  hasNonEmptyStringField,
  isDebugEnabled,
} from './aiChatShared.js';
import type { DebuggableAiError } from './aiChatShared.js';

import {
  INTAKE_TOOLS,
  buildIntakeSystemPrompt,
  deriveCaseSavedAcknowledgment,
  mergeIntakeState,
  normalizeServicesForPrompt,
  extractServiceNames,
  formatServiceList,
  shouldRequireDisclaimer,
  buildCompactPracticeContextForPrompt,
  executeIntakeTool,
  type IntakeSubmissionGate,
  type ToolResult,
} from './aiChatIntake.js';

import {
  ONBOARDING_TOOL,
  buildOnboardingSystemPrompt,
  buildOnboardingProfileMetadata,
} from './aiChatOnboarding.js';
import type { ChatMessageAction } from '../../src/shared/types/conversation';
import { normalizeChatActions } from '../../src/shared/utils/chatActions';

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const readBooleanField = (record: Record<string, unknown> | null, keys: string[]): boolean | null => {
  if (!record) return null;
  for (const key of keys) {
    if (typeof record[key] === 'boolean') return record[key] as boolean;
  }
  return null;
};

const readFiniteNumberField = (record: Record<string, unknown> | null, keys: string[]): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

const resolvePracticeRequiresPaymentBeforeSubmission = (details: Record<string, unknown> | null): boolean => {
  if (!details) return false;
  const consultationFee = readFiniteNumberField(details, [
    'consultationFee',
    'consultation_fee',
  ]);
  if (consultationFee !== null && consultationFee > 0) return true;

  const paymentLinkEnabled = readBooleanField(details, [
    'paymentLinkEnabled',
    'payment_link_enabled',
  ]);
  return paymentLinkEnabled === true;
};

const unwrapToolCallJsonArgs = (rawArgs: string): string => {
  let cleanArgs = rawArgs.trim();

  const xmlMatch = cleanArgs.match(/<tool_call[^>]*>([\s\S]*?)<\/tool_call>/i);
  if (xmlMatch) cleanArgs = xmlMatch[1].trim();

  const fenceMatch = cleanArgs.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) cleanArgs = fenceMatch[1].trim();

  const functionWrapperMatch = cleanArgs.match(/^[a-zA-Z0-9_]+\s*\(([\s\S]*)\)\s*;?$/);
  if (functionWrapperMatch) cleanArgs = functionWrapperMatch[1].trim();

  const objectMatch = cleanArgs.match(/\{[\s\S]*\}/);
  if (objectMatch) cleanArgs = objectMatch[0].trim();

  return cleanArgs;
};

const persistMergedIntakeState = async (
  conversationService: ConversationService,
  params: {
    conversationId: string;
    practiceId: string;
    consultationStatus: string | null | undefined;
    mergedIntakeState: Record<string, unknown>;
  },
  attempts = 0
): Promise<void> => {
  try {
    await conversationService.mergeConsultationMetadata(
      params.conversationId,
      params.practiceId,
      {
        case: params.mergedIntakeState,
        status: params.consultationStatus === 'ready_to_submit'
          || params.mergedIntakeState.ctaResponse === 'ready'
          ? 'ready_to_submit'
          : 'collecting_case',
      },
      { repair: false }
    );
  } catch (metadataError) {
    if (attempts < 1) {
      await persistMergedIntakeState(conversationService, params, attempts + 1);
      return;
    }
    Logger.warn('Failed to persist merged intake state to conversation metadata after retries', {
      conversationId: params.conversationId,
      error: metadataError instanceof Error ? metadataError.message : String(metadataError),
    });
  }
};

const schedulePostStreamTasks = (
  context: ExecutionContext | undefined,
  conversationId: string,
  tasks: Promise<unknown>[],
  onSettled?: () => void,
) => {
  const persistAfterStream = Promise.allSettled(tasks).then((results) => {
    for (const result of results) {
      if (result.status === 'rejected') {
        Logger.warn('Post-stream persistence task failed', {
          conversationId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }).finally(() => {
    onSettled?.();
  });

  if (context) {
    context.waitUntil(persistAfterStream);
    return;
  }
  persistAfterStream.catch((error) => {
    Logger.warn('persistAfterStream uncaught error', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};

const deriveQuickActionState = (params: {
  isOnboardingMode: boolean;
  onboardingFields: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
}) => {
  let onboardingFields = params.onboardingFields;
  let actions: ChatMessageAction[] | null = null;
  let onboardingProfile: Record<string, unknown> | null = null;
  let triggerEditModal: string | null = null;

  const fieldsForActions = params.isOnboardingMode ? onboardingFields : null;
  if (fieldsForActions && Array.isArray(fieldsForActions.actions)) {
    actions = normalizeChatActions(fieldsForActions.actions).slice(0, 3);
    if (actions.length === 0) actions = null;
  }
  if (onboardingFields && 'actions' in onboardingFields) {
    const { actions: _actions, ...rest } = onboardingFields as Record<string, unknown>;
    onboardingFields = rest;
  }
  if (onboardingFields && 'triggerEditModal' in onboardingFields) {
    triggerEditModal = onboardingFields.triggerEditModal as string;
    const { triggerEditModal: _t, ...rest } = onboardingFields as Record<string, unknown>;
    onboardingFields = rest;
  }
  if (params.isOnboardingMode) {
    onboardingProfile = buildOnboardingProfileMetadata(params.details, onboardingFields);
  }

  return {
    onboardingFields,
    onboardingProfile,
    triggerEditModal,
    actions,
  };
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleAiChat(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const requestStartedAt = Date.now();

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
  Logger.info('AI chat timing: auth complete', {
    elapsedMs: Date.now() - requestStartedAt,
  });

  const body = await parseJsonBody(request) as {
    conversationId?: string;
    practiceSlug?: string;
    mode?: 'ASK_QUESTION' | 'REQUEST_CONSULTATION' | 'PRACTICE_ONBOARDING';
    intakeSubmitted?: boolean;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    additionalContext?: string;
    sourceBubbleId?: string;
  };
  Logger.info('AI chat timing: request body parsed', {
    conversationId: body.conversationId ?? null,
    elapsedMs: Date.now() - requestStartedAt,
    messageCount: Array.isArray(body.messages) ? body.messages.length : null,
  });

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

  // For anonymous widget sessions the slug is on the body — slug-based cache lookup
  // does not need practiceId, so we can fire it concurrently with getConversationById.
  const practiceSlugFromBody = typeof body.practiceSlug === 'string' ? body.practiceSlug.trim() : '';
  const anonymousPrefetchEnabled = authContext.isAnonymous === true && practiceSlugFromBody.length > 0;
  const anonymousPracticeDetailsPrefetch = anonymousPrefetchEnabled
    ? fetchPracticeDetailsWithCache(env, request, '', practiceSlugFromBody, {
        bypassCache: body.mode === 'PRACTICE_ONBOARDING',
        preferPracticeIdLookup: false,
      })
    : null;

  const conversationService = new ConversationService(env);
  // repair: false on per-turn load — repair belongs at bootstrap only
  const conversation = await conversationService.getConversationById(body.conversationId, { repair: false });
  Logger.info('AI chat timing: conversation loaded', {
    conversationId: body.conversationId,
    elapsedMs: Date.now() - requestStartedAt,
  });
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

  const conversationMetadata = isRecord(conversation.user_info) ? conversation.user_info : null;
  const storedMode = typeof conversationMetadata?.mode === 'string' ? conversationMetadata.mode : null;
  const effectiveMode = body.mode ?? storedMode;

  const practiceSlugFromConversation =
    conversation.practice && typeof conversation.practice.slug === 'string'
      ? conversation.practice.slug.trim()
      : '';
  const practiceSlugFromMetadata =
    typeof conversationMetadata?.practiceSlug === 'string'
      ? conversationMetadata.practiceSlug.trim()
      : '';
  const practiceSlug = practiceSlugFromBody || practiceSlugFromConversation || practiceSlugFromMetadata;

  const auditService = new SessionAuditService(env);

  // Load practice details - audit write is best-effort and should not crash the flow
  let practiceDetailsPromise: ReturnType<typeof fetchPracticeDetailsWithCache>;
  
  // For anonymous sessions, try to use the prefetch if available and practiceId matches
  if (anonymousPracticeDetailsPrefetch && practiceId) {
    practiceDetailsPromise = (async () => {
      try {
        // Wait for the prefetch to complete
        const prefetchResult = await anonymousPracticeDetailsPrefetch;
        
        // Check if the prefetch result contains practice details that match our practiceId
        // We need to extract the practice ID from the prefetch result to validate
        const prefetchPayload = prefetchResult.details;
        const prefetchPracticeId = prefetchPayload?.id || prefetchPayload?.practiceId;
        
        if (prefetchPracticeId === practiceId) {
          // Prefetch matches our conversation's practice - use it!
          Logger.info('Using anonymous prefetch result - practiceId matches', {
            conversationId: body.conversationId,
            practiceId,
            prefetchPracticeId,
            anonymousPrefetch: true
          });
          return prefetchResult;
        } else {
          // Prefetch doesn't match - fall back to proper lookup
          Logger.info('Anonymous prefetch practiceId mismatch - falling back to practiceId lookup', {
            conversationId: body.conversationId,
            practiceId,
            prefetchPracticeId,
            anonymousPrefetch: true
          });
          return fetchPracticeDetailsWithCache(
            env,
            request,
            practiceId,
            practiceSlug || undefined,
            {
              bypassCache: effectiveMode === 'PRACTICE_ONBOARDING',
              preferPracticeIdLookup: authContext.isAnonymous !== true,
            }
          );
        }
      } catch (error) {
        // Prefetch failed - fall back to normal lookup
        Logger.warn('Anonymous prefetch failed - falling back to practiceId lookup', {
          conversationId: body.conversationId,
          practiceId,
          error: error instanceof Error ? error.message : String(error)
        });
        return fetchPracticeDetailsWithCache(
          env,
          request,
          practiceId,
          practiceSlug || undefined,
          {
            bypassCache: effectiveMode === 'PRACTICE_ONBOARDING',
            preferPracticeIdLookup: authContext.isAnonymous !== true,
          }
        );
      }
    })();
  } else {
    // Normal practice details lookup for authenticated sessions or when no prefetch available
    practiceDetailsPromise = fetchPracticeDetailsWithCache(
      env,
      request,
      practiceId || '',
      practiceSlug || undefined,
      {
        bypassCache: effectiveMode === 'PRACTICE_ONBOARDING',
        preferPracticeIdLookup: authContext.isAnonymous !== true,
      }
    );
  }

  // Best-effort audit write - errors are caught and logged
  auditService.createEvent({
    conversationId: body.conversationId,
    practiceId,
    eventType: 'ai_message_sent',
    actorType: 'user',
    actorId: authContext.user.id,
    payload: { conversationId: body.conversationId }
  }).catch(error => {
    Logger.error('Failed to create audit event for ai_message_sent', {
      conversationId: body.conversationId,
      practiceId,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  // Run practice details fetch
  let details: Record<string, unknown> | null = null;
  let isPublic = false;
  try {
    ({ details, isPublic } = await practiceDetailsPromise);
    Logger.info('AI chat timing: practice details loaded', {
      conversationId: body.conversationId,
      practiceId,
      elapsedMs: Date.now() - requestStartedAt,
      anonymousPrefetch: anonymousPrefetchEnabled,
    });
  } catch (error) {
    Logger.error('AI chat failed to load practice details', {
      practiceId,
      practiceSlug,
      conversationId: body.conversationId,
      status: error instanceof HttpError ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const isOnboardingMode = effectiveMode === 'PRACTICE_ONBOARDING';
  const consultation = resolveConsultationState(conversationMetadata);
  const storedIntakeState = consultation?.case
    ? consultation.case as unknown as Record<string, unknown>
    : isRecord(conversationMetadata?.intakeConversationState)
      ? conversationMetadata.intakeConversationState as Record<string, unknown>
      : null;
  const slimDraft = consultation?.contact
    ? consultation.contact as unknown as Record<string, unknown>
    : isRecord(conversationMetadata?.intakeSlimContactDraft)
      ? conversationMetadata.intakeSlimContactDraft as Record<string, unknown>
      : null;
  const hasSlimContactDraft = Boolean(
    slimDraft && (
      hasNonEmptyStringField(slimDraft, 'name') ||
      hasNonEmptyStringField(slimDraft, 'email') ||
      hasNonEmptyStringField(slimDraft, 'phone')
    )
  );
  const intakeBriefActive = consultation
    ? consultation.status === 'collecting_case' || consultation.status === 'ready_to_submit'
    : conversationMetadata?.intakeAiBriefActive === true;
  const isIntakeMode = Boolean(
    (effectiveMode === 'REQUEST_CONSULTATION' || Boolean(consultation) || hasSlimContactDraft || intakeBriefActive) &&
    body.intakeSubmitted !== true &&
    isPublic
  );
  const isGeneralQaMode = !isIntakeMode && !isOnboardingMode;
  const shouldSkipPracticeValidation = authContext.isAnonymous === true || isPublic;

  Logger.info('AI chat mode resolution', {
    conversationId: body.conversationId,
    requestedMode: body.mode ?? null,
    storedMode,
    effectiveMode: effectiveMode ?? null,
    isPublic,
    isAnonymous: authContext.isAnonymous === true,
    consultationResolved: Boolean(consultation),
    consultationStatus: consultation?.status ?? null,
    hasStoredIntakeState: Boolean(storedIntakeState),
    hasSlimContactDraft,
    intakeBriefActive,
    intakeSubmitted: body.intakeSubmitted === true,
    isIntakeMode,
    isOnboardingMode,
    isGeneralQaMode,
  });

  if (!details) {
    throw HttpErrors.badGateway(
      `Practice details lookup returned no payload for practice ${practiceId}${practiceSlug ? ` (${practiceSlug})` : ''}.`
    );
  }
  if (!isPublic && !isOnboardingMode) {
    throw HttpErrors.forbidden(
      'This practice is not publicly available for chat. Please request consultation to continue.'
    );
  }

  const lastUserMessage = [...body.messages].reverse().find((message) => message.role === 'user');
  const serviceNames = extractServiceNames(details);
  const hasLegalIntent = Boolean(lastUserMessage && LEGAL_INTENT_REGEX.test(lastUserMessage.content));

  // ------------------------------------------------------------------
  // Short-circuit paths — instant replies that don't need streaming.
  // ------------------------------------------------------------------

  let shortCircuitReply: string | null = null;
  let shortCircuitOnboardingProfile: Record<string, unknown> | null = null;

  if (lastUserMessage && HOURS_QUESTION_REGEX.test(lastUserMessage.content)) {
    const phone = readStringField(details, 'business_phone') ?? readStringField(details, 'businessPhone');
    const email = readStringField(details, 'business_email') ?? readStringField(details, 'businessEmail');
    const website = readStringField(details, 'website');
    const contactParts = [phone ? `phone: ${phone}` : null, email ? `email: ${email}` : null, website ? `website: ${website}` : null]
      .filter((value): value is string => Boolean(value));
    shortCircuitReply = contactParts.length > 0
      ? `The practice has not published specific office hours here yet. You can contact them via ${contactParts.join(', ')}.`
      : 'The practice has not published specific office hours here yet. Please click "Request consultation" to connect with the practice.';
  } else if (isGeneralQaMode && hasLegalIntent) {
    shortCircuitReply = LEGAL_DISCLAIMER;
  } else if (isGeneralQaMode && lastUserMessage && SERVICE_QUESTION_REGEX.test(lastUserMessage.content) && serviceNames.length > 0) {
    const normalizedQuestion = normalizeText(lastUserMessage.content);
    const matchedService = serviceNames.find((service) => normalizedQuestion.includes(normalizeText(service)));
    shortCircuitReply = matchedService
      ? `Yes — we handle ${matchedService}. Would you like to request a consultation?`
      : `We currently handle ${formatServiceList(serviceNames)}. Would you like to request a consultation?`;
  }

  if (shortCircuitReply !== null) {
    if (isOnboardingMode) {
      shortCircuitOnboardingProfile = buildOnboardingProfileMetadata(details, null);
    }
    const shouldPromptConsultation =
      !hasSlimContactDraft &&
      (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(shortCircuitReply));

    const storedMessage = await conversationService.sendSystemMessage({
      conversationId: body.conversationId,
      practiceId: conversation.practice_id,
      content: shortCircuitReply,
      metadata: {
        source: 'ai',
        model: DEFAULT_AI_MODEL,
        ...(shortCircuitOnboardingProfile ? { onboardingProfile: shortCircuitOnboardingProfile } : {}),
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
      JSON.stringify({
        reply: shortCircuitReply,
        message: storedMessage,
        intakeFields: null,
        onboardingFields: null,
        onboardingProfile: shortCircuitOnboardingProfile,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ------------------------------------------------------------------
  // Streaming path
  // ------------------------------------------------------------------

  const aiPromptContext = buildCompactPracticeContextForPrompt(details);
  const aiClient = createAiClient(env);
  const model = DEFAULT_AI_MODEL;

  const servicesForPrompt = normalizeServicesForPrompt(details);
  const onboardingPromptProfile = isOnboardingMode
    ? buildOnboardingProfileMetadata(details, null)
    : null;
  const intakeSubmissionGate: IntakeSubmissionGate = {
    paymentRequiredBeforeSubmit:
      (consultation?.submission?.paymentRequired === true) ||
      resolvePracticeRequiresPaymentBeforeSubmission(details),
    paymentCompleted: consultation?.submission?.paymentReceived === true,
  };

  const requestPayload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    stream: true,
    messages: [],
  };

  let systemPrompt: string;

  if (isIntakeMode) {
    // One unified system prompt — no KNOWN SO FAR injection, no dynamic split
    systemPrompt = [
      buildIntakeSystemPrompt(servicesForPrompt, aiPromptContext, storedIntakeState),
      `PRACTICE_CONTEXT: ${JSON.stringify(aiPromptContext)}`,
      body.additionalContext ? `SEARCH_CONTEXT: ${body.additionalContext}` : null,
    ].filter(Boolean).join('\n\n');

    requestPayload.messages = [
      { role: 'system', content: systemPrompt },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    requestPayload.tools = INTAKE_TOOLS;
    requestPayload.parallel_tool_calls = false;
  } else if (!isIntakeMode) {
    const nonIntakeSystemPrompt = isOnboardingMode
      ? buildOnboardingSystemPrompt(onboardingPromptProfile)
      : [
        'You are an intake assistant for a law practice website.',
        'You may answer only operational questions using provided practice details.',
        `If user asks for legal advice: respond with the exact sentence: "${LEGAL_DISCLAIMER}" and recommend consultation.`,
        'Ask only ONE clarifying question max per assistant message.',
        'If you don\'t have practice details: say you don\'t have access and recommend consultation.',
      ].join('\n');

    systemPrompt = [
      nonIntakeSystemPrompt,
      `PRACTICE_CONTEXT: ${JSON.stringify(aiPromptContext)}`,
    ].join('\n\n');

    requestPayload.messages = [
      { role: 'system', content: systemPrompt },
      ...(body.additionalContext
        ? [{ role: 'system' as const, content: `SEARCH_CONTEXT: ${body.additionalContext}` }]
        : []),
      ...body.messages.map((message) => ({ role: message.role, content: message.content })),
    ];
  } else {
    // This should not happen, but TypeScript needs it
    systemPrompt = 'You are an assistant.';
  }

  if (isOnboardingMode) {
    requestPayload.tools = [ONBOARDING_TOOL];
    requestPayload.tool_choice = {
      type: 'function',
      function: { name: 'update_practice_fields' },
    };
    requestPayload.parallel_tool_calls = false;
  }

  const { response: sseResponse, write, close } = createSseResponse();
  Logger.info('AI chat timing: SSE response prepared', {
    conversationId: body.conversationId,
    elapsedMs: Date.now() - requestStartedAt,
    isIntakeMode,
    isOnboardingMode,
  });

  const streamAndPersist = async (env: Env) => {
    const requestId = crypto.randomUUID();
    let accumulatedReply = '';
    let onboardingFields: Record<string, unknown> | null = null;
    let emittedAnyToken = false;
    const debugEnabled = isDebugEnabled(env.DEBUG);
    
    // Define debug function for SSE
    const sendSseDebug = (event: string, data: Record<string, unknown>) => {
      if (debugEnabled) {
        write({ type: 'debug', event, ...data });
      }
    };

    const startedAt = Date.now();
    let responseClosed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      if (isIntakeMode || isOnboardingMode) {
        const toolNames = Array.isArray(requestPayload.tools)
          ? requestPayload.tools
              .map((tool) => (tool as { function?: { name?: string } }).function?.name ?? null)
              .filter((name): name is string => Boolean(name))
          : [];
        Logger.info('AI tool request summary', {
          conversationId: body.conversationId,
          mode: effectiveMode ?? null,
          isIntakeMode,
          isOnboardingMode,
          toolNames,
          messageCount: body.messages.length,
        });
      }

      const conversationRequestStartedAt = Date.now();
      let conversationTTFTMs: number | null = null;
      const controller = new AbortController();
      timeoutId = setTimeout(() => {
        controller.abort();
      }, AI_TIMEOUT_MS);
      const streamWrite = (payload: Record<string, unknown>) => {
        if (conversationTTFTMs === null && typeof payload.token === 'string' && payload.token.length > 0) {
          conversationTTFTMs = Date.now() - conversationRequestStartedAt;
        }
        write(payload);
      };
      const conversationCallPromise = aiClient.requestChatCompletions(
        requestPayload,
        controller.signal,
        { headers: { 'x-session-affinity': body.conversationId } }
      );

      const aiResponse = await conversationCallPromise;
      Logger.info('AI chat timing: conversation upstream headers received', {
        conversationId: body.conversationId,
        elapsedMs: Date.now() - conversationRequestStartedAt,
        totalElapsedMs: Date.now() - requestStartedAt,
        status: aiResponse.status,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text().catch(() => '');
        Logger.warn('AI upstream request failed', {
          conversationId: body.conversationId,
          status: aiResponse.status,
          body: errorText,
          model,
        });
        throw new Error('AI upstream request failed');
      }

      if (!aiResponse.body) {
        throw new Error('AI upstream request failed: missing body');
      }

      const aigStep = aiResponse.headers.get('cf-aig-step');

      // Stream tokens live to the user — intake mode now streams directly
      const streamResult = await consumeAiStream(
        aiResponse, 
        true, 
        streamWrite, 
        body.conversationId,
        requestId,
        sendSseDebug
      );
      const conversationTotalResponseMs = Date.now() - conversationRequestStartedAt;
      const latencyMs = Date.now() - startedAt;

      Logger.info('AI response complete', {
        conversationId: body.conversationId,
        model,
        aigStep,
        latencyMs,
        emittedToken: streamResult.emittedToken,
        streamStalled: streamResult.streamStalled,
        hasToolCalls: streamResult.toolCalls.length > 0,
        toolCallCount: streamResult.toolCalls.length,
        replyLength: streamResult.reply.length,
        conversationTTFTMs,
        conversationTotalResponseMs,
      });

      accumulatedReply = streamResult.reply;
      emittedAnyToken = streamResult.emittedToken;

      // ── Execute tool calls inline ─────────────────────────────────────────
      // When the model emits tool_use blocks, execute each handler immediately
      // after streaming completes. Persist the result. No second model call.
      let lastToolResult: ToolResult | null = null;
      let accumulatedIntakePatch: Record<string, unknown> = {};

      for (const toolCall of streamResult.toolCalls) {
        // Log raw tool call details - removed PII
        if (debugEnabled) {
          Logger.info('ai.tool.raw', {
            requestId,
            conversationId: body.conversationId,
            toolName: toolCall.name,
            argLength: toolCall.arguments.length,
          });
        }
        
        if (debugEnabled) {
          sendSseDebug('debug_tool_call', {
            requestId,
            toolName: toolCall.name,
            argLength: toolCall.arguments.length,
          });
        }
        
        if (isIntakeMode && (
          toolCall.name === 'save_case_details' ||
          toolCall.name === 'request_payment' ||
          toolCall.name === 'submit_intake'
        )) {
          const cleanArgs = unwrapToolCallJsonArgs(toolCall.arguments);
          const result = executeIntakeTool(
            toolCall.name,
            cleanArgs,
            mergeIntakeState(storedIntakeState, Object.keys(accumulatedIntakePatch).length > 0 ? accumulatedIntakePatch : null),
            intakeSubmissionGate,
          );
          lastToolResult = result;

          if (result.success && result.intakeFields) {
            accumulatedIntakePatch = { ...accumulatedIntakePatch, ...result.intakeFields };
          }
        } else if (toolCall.name === 'update_practice_fields' && toolCall.arguments.length > 0) {
          try {
            const rawParams = JSON.parse(unwrapToolCallJsonArgs(toolCall.arguments));
            onboardingFields = normalizeKeys(rawParams) as Record<string, unknown>;
          } catch (error) {
            Logger.warn('Failed to parse streamed onboarding tool arguments', {
              conversationId: body.conversationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      if (!accumulatedReply.trim() && !lastToolResult && !onboardingFields) {
        throw createAiDebugError(
          isIntakeMode
            ? 'AI returned no user-facing reply in intake mode.'
            : isOnboardingMode
              ? 'AI returned no user-facing reply in onboarding mode.'
              : 'AI returned an empty reply.',
          'ai_empty_reply',
          {
            mode: effectiveMode ?? null,
            isIntakeMode,
            isOnboardingMode,
            streamStalled: streamResult.streamStalled,
          }
        );
      }

      if (!emittedAnyToken && accumulatedReply.trim()) {
        write({ token: accumulatedReply });
        emittedAnyToken = true;
        if (conversationTTFTMs === null) {
          conversationTTFTMs = Date.now() - conversationRequestStartedAt;
        }
      }

      // ── Derive chat actions from tool results ─────────────────────────────
      // Action buttons come from tool execution results, never from model output parsing.
      let actions: ChatMessageAction[] | null = null;
      let onboardingProfile: Record<string, unknown> | null = null;
      let triggerEditModal: string | null = null;

      if (isIntakeMode && lastToolResult?.actions && lastToolResult.actions.length > 0) {
        actions = lastToolResult.actions;
      }

      if (isOnboardingMode) {
        const quickActionState = deriveQuickActionState({
          isOnboardingMode,
          onboardingFields,
          details,
        });
        onboardingFields = quickActionState.onboardingFields;
        onboardingProfile = quickActionState.onboardingProfile;
        triggerEditModal = quickActionState.triggerEditModal;
        actions = quickActionState.actions;
      }

      // Merge tool-collected fields into intake state
      const patchToMerge = Object.keys(accumulatedIntakePatch).length > 0 ? accumulatedIntakePatch : null;
      const mergedIntakeState = isIntakeMode
        ? mergeIntakeState(storedIntakeState, patchToMerge)
        : null;

      const shouldPromptConsultation =
        !hasSlimContactDraft &&
        (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(accumulatedReply));
      const includeActionsInMetadata = Boolean(actions && actions.length > 0);
      
      // Detect tool-only behavior and normalization
      const wasToolOnly = accumulatedReply.trim().length === 0 && streamResult.toolCalls.length > 0;
      const normalizationReasons: string[] = [];
      let syntheticReply = '';

      if (wasToolOnly) {
        normalizationReasons.push('tool_only_completion');
        if (isIntakeMode && lastToolResult?.success && patchToMerge) {
          syntheticReply = deriveCaseSavedAcknowledgment(
            lastToolResult,
            intakeSubmissionGate,
            mergedIntakeState,
            servicesForPrompt,
          );
        }
      }
      
      sendSseDebug('debug_normalization', {
        requestId,
        reasons: normalizationReasons,
        syntheticReply: syntheticReply || accumulatedReply,
        wasToolOnly,
      });

      // Store message BEFORE emitting done — client acts on fields immediately
      const finalReply = syntheticReply || accumulatedReply;
      if (finalReply.trim()) {
        const storedMessage = await conversationService.sendSystemMessage({
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          content: finalReply,
          metadata: {
            source: 'ai',
            model,
            ...(body.sourceBubbleId ? { sourceBubbleId: body.sourceBubbleId } : {}),
            ...(aigStep ? { aigStep } : {}),
            ...(patchToMerge ? { intakeFields: patchToMerge } : {}),
            ...(onboardingFields ? { onboardingFields } : {}),
            ...(onboardingProfile ? { onboardingProfile } : {}),
            ...(includeActionsInMetadata ? { actions } : {}),
            ...(triggerEditModal ? { triggerEditModal } : {}),
            ...(shouldPromptConsultation
              ? { modeSelector: { showAskQuestion: false, showRequestConsultation: true, source: 'ai' } }
              : {}),
            ...(wasToolOnly ? { wasToolOnly, normalizationReasons } : {}),
          },
          recipientUserId: authContext.user.id,
          skipPracticeValidation: shouldSkipPracticeValidation,
          request
        });

        // Log message persistence
        Logger.info('ai.message.persisted', {
          requestId,
          conversationId: body.conversationId,
          messageId: storedMessage.id,
          role: 'assistant',
          kind: wasToolOnly ? 'synthetic' : 'original',
          wasToolOnly,
        });

        if (debugEnabled) {
          write({ debug: { persistedId: storedMessage.id } });
        }
      }

      // Emit done — client acts on fields immediately after persistence is confirmed
      write({
        done: true,
        reply: finalReply,
        intakeFields: mergedIntakeState ?? null,
        onboardingFields: onboardingFields ?? null,
        onboardingProfile: onboardingProfile ?? null,
        actions: actions ?? null,
        wasToolOnly,
      });

      close();
      responseClosed = true;

      const postStreamTasks: Promise<unknown>[] = [];

      // Persist intake metadata off the stream-critical path
      if (isIntakeMode && mergedIntakeState) {
        postStreamTasks.push(
          persistMergedIntakeState(conversationService, {
            conversationId: body.conversationId,
            practiceId: conversation.practice_id,
            consultationStatus: consultation?.status,
            mergedIntakeState,
          })
        );
      }

      postStreamTasks.push(auditService.createEvent({
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        eventType: 'ai_message_received',
        actorType: 'system',
        payload: { conversationId: body.conversationId }
      }));

      schedulePostStreamTasks(ctx, body.conversationId, postStreamTasks);

    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof Error && error.name === 'AbortError') {
        Logger.warn('AI request timed out', {
          conversationId: body.conversationId,
          timeout: AI_TIMEOUT_MS
        });
        write({ error: true, code: 'ai_request_timeout', message: 'AI request timed out' });
      } else {
        const typedError = error as DebuggableAiError;
        Logger.warn('Streaming AI handler error', {
          conversationId: body.conversationId,
          error: error instanceof Error ? error.message : String(error),
          code: typedError?.code ?? null,
          details: typedError?.details ?? null,
        });
        write({
          error: true,
          code: typedError?.code ?? 'ai_request_failed',
          message: error instanceof Error ? error.message : 'AI request failed',
          details: typedError?.details ?? null,
        });
      }
    } finally {
      if (!responseClosed) {
        close();
      }
    }
  };

  if (ctx) {
    ctx.waitUntil(streamAndPersist(env));
  } else {
    streamAndPersist(env).catch((error) => {
      Logger.warn('streamAndPersist uncaught error', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return sseResponse;
}
