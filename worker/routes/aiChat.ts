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

// Import from split files
import {
  DEFAULT_AI_MODEL,
  LEGAL_DISCLAIMER,
  MAX_MESSAGES,
  MAX_MESSAGE_LENGTH,
  MAX_TOTAL_LENGTH,
  AI_TIMEOUT_MS,
  AI_STREAM_READ_TIMEOUT_MS,
  CONSULTATION_CTA_REGEX,
  SERVICE_QUESTION_REGEX,
  HOURS_QUESTION_REGEX,
  LEGAL_INTENT_REGEX,
  encoder,
  sseEvent,
  createSseResponse,
  consumeAiStream,
  normalizeKeys,
  parseToolCallFromReply,
  createAiDebugError,
  isRecord,
  readStringField,
  hasNonEmptyStringField,
  readAnyString,
  isDebugEnabled,
  DebuggableAiError,
} from './aiChatShared.js';

import {
  INTAKE_TOOL,
  buildIntakeSystemPrompt,
  mergeIntakeState,
  shouldShowDeterministicIntakeCta,
  buildIntakeSummaryFromState,
  shouldShowIntakeCtaForReply,
  normalizeServicesForPrompt,
  extractServiceNames,
  formatServiceList,
  normalizeApostrophes,
  shouldRequireDisclaimer,
  countQuestions,
  buildPracticeContactErrorReply,
  normalizePracticeDetailsForAi,
} from './aiChatIntake.js';

import {
  ONBOARDING_TOOL,
  buildOnboardingSystemPrompt,
  buildOnboardingProfileMetadata,
} from './aiChatOnboarding.js';

const normalizeText = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
    mode?: 'ASK_QUESTION' | 'REQUEST_CONSULTATION' | 'PRACTICE_ONBOARDING';
    intakeSubmitted?: boolean;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    additionalContext?: string;
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
  const conversation = await conversationService.getConversationById(body.conversationId, { repair: true });
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

  const conversationMetadata = isRecord(conversation.user_info) ? conversation.user_info : null;
  const storedMode = typeof conversationMetadata?.mode === 'string' ? conversationMetadata.mode : null;
  const effectiveMode = body.mode ?? storedMode;

  const practiceSlugFromBody = typeof body.practiceSlug === 'string' ? body.practiceSlug.trim() : '';
  const practiceSlugFromConversation =
    conversation.practice && typeof conversation.practice.slug === 'string'
      ? conversation.practice.slug.trim()
      : '';
  const practiceSlugFromMetadata =
    typeof conversationMetadata?.practiceSlug === 'string'
      ? conversationMetadata.practiceSlug.trim()
      : '';
  const practiceSlug = practiceSlugFromBody || practiceSlugFromConversation || practiceSlugFromMetadata;

  let details: Record<string, unknown> | null = null;
  let isPublic = false;
  try {
    ({ details, isPublic } = await fetchPracticeDetailsWithCache(
      env,
      request,
      practiceId,
      practiceSlug || undefined,
      {
        bypassCache: effectiveMode === 'PRACTICE_ONBOARDING',
        preferPracticeIdLookup: authContext.isAnonymous !== true,
      }
    ));
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
  const intakeModeSignals = {
    requestedModeIsConsultation: effectiveMode === 'REQUEST_CONSULTATION',
    hasConsultationState: Boolean(consultation),
    consultationStatus: consultation?.status ?? null,
    hasSlimContactDraft,
    intakeBriefActive,
    intakeSubmitted: body.intakeSubmitted === true,
    isPublic,
  };
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

  if (isIntakeMode && effectiveMode !== 'REQUEST_CONSULTATION') {
    Logger.warn('AI chat entered intake mode without explicit consultation mode', {
      conversationId: body.conversationId,
      requestedMode: body.mode ?? null,
      storedMode,
      effectiveMode: effectiveMode ?? null,
      intakeModeSignals,
      metadataKeys: conversationMetadata ? Object.keys(conversationMetadata).sort() : [],
      consultationSnapshot: consultation
        ? {
            mode: consultation.mode ?? null,
            status: consultation.status ?? null,
            hasCase: Boolean(consultation.case),
            hasContact: Boolean(consultation.contact),
            hasIntakeId:
              typeof consultation.submission.intakeUuid === 'string'
              && consultation.submission.intakeUuid.trim().length > 0,
          }
        : null,
    });
  }

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
  const intakeReadyByState = isIntakeMode && shouldShowDeterministicIntakeCta(storedIntakeState);

  // ------------------------------------------------------------------
  // Short-circuit paths — instant replies that don't need streaming.
  // These return a JSON response identical to the old format so any
  // legacy client code that hasn't been updated yet still works.
  // ------------------------------------------------------------------

  let shortCircuitReply: string | null = null;
  let shortCircuitIntakeReadyCta = false;
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
        model: DEFAULT_AI_MODEL,
        ...(shortCircuitOnboardingProfile ? { onboardingProfile: shortCircuitOnboardingProfile } : {}),
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
  // Streaming path — calls Workers AI with stream:true, pipes tokens to the
  // client via SSE, then persists the completed message via waitUntil.
  // ------------------------------------------------------------------

  const aiDetails = normalizePracticeDetailsForAi(details);
  const aiClient = createAiClient(env);
  const model = DEFAULT_AI_MODEL;

  const servicesForPrompt = normalizeServicesForPrompt(details);
  const onboardingPromptProfile = isOnboardingMode
    ? buildOnboardingProfileMetadata(details, null)
    : null;
  const systemPrompt = isIntakeMode
    ? buildIntakeSystemPrompt(servicesForPrompt)
    : isOnboardingMode
      ? buildOnboardingSystemPrompt(onboardingPromptProfile)
      : [
        'You are an intake assistant for a law practice website.',
        'You may answer only operational questions using provided practice details.',
        `If user asks for legal advice: respond with the exact sentence: "${LEGAL_DISCLAIMER}" and recommend consultation.`,
        'Ask only ONE clarifying question max per assistant message.',
        'If you don\'t have practice details: say you don\'t have access and recommend consultation.',
      ].join('\n');

  const fullSystemPrompt = [
    systemPrompt,
    `PRACTICE_CONTEXT: ${JSON.stringify(aiDetails)}`,
    (isIntakeMode && storedIntakeState) ? `INTAKE_CONTEXT: ${JSON.stringify(storedIntakeState)}` : null,
    body.additionalContext ? `SEARCH_CONTEXT: ${body.additionalContext}` : null
  ].filter(Boolean).join('\n\n');

  const requestPayload: Record<string, unknown> = {
    model: model,
    temperature: 0.2,
    stream: true,
    messages: [
      { role: 'system', content: fullSystemPrompt },
      ...body.messages.map((message) => ({ role: message.role, content: message.content }))
    ]
  };

  // Intake mode uses tools — Workers AI supports streaming with tools,
  // but the tool call arguments arrive in chunks too. We accumulate them
  // separately and only emit the done event once the full tool call is parsed.
  if (isIntakeMode) {
    requestPayload.tools = [INTAKE_TOOL];
  } else if (isOnboardingMode) {
    requestPayload.tools = [ONBOARDING_TOOL];
  }

  const { response: sseResponse, write, close } = createSseResponse();

  // Kick off the async work and register it with ctx.waitUntil so Cloudflare
  // does not terminate the worker before persistence completes.
  const streamAndPersist = async (env: Env) => {
    let accumulatedReply = '';
    let intakeFields: Record<string, unknown> | null = null;
    let onboardingFields: Record<string, unknown> | null = null;
    let quickReplies: string[] | null = null;
    let onboardingProfile: Record<string, unknown> | null = null;
    let emittedAnyToken = false;

    const requestFollowupUserFacingReply = async (options: {
      mode: 'intake' | 'onboarding';
      intakeFields?: Record<string, unknown> | null;
      onboardingFields?: Record<string, unknown> | null;
    }): Promise<string> => {
      const nextFullSystemPrompt = [
        options.mode === 'intake'
          ? buildIntakeSystemPrompt(servicesForPrompt)
          : buildOnboardingSystemPrompt(
              options.onboardingFields
                ? buildOnboardingProfileMetadata(details, options.onboardingFields)
                : onboardingPromptProfile
            ),
        `PRACTICE_CONTEXT: ${JSON.stringify(aiDetails)}`,
        options.mode === 'intake'
          ? `INTAKE_CONTEXT: ${JSON.stringify(mergeIntakeState(storedIntakeState, options.intakeFields ?? null))}`
          : null,
        body.additionalContext ? `SEARCH_CONTEXT: ${body.additionalContext}` : null,
        options.mode === 'intake'
          ? 'You have already saved the structured intake fields for the latest user message. Respond to the user with exactly one warm, concise next-step intake question. Do not output JSON or tool-call syntax.'
          : 'You have already saved the structured onboarding fields for the latest user message. Respond to the user with one warm, concise next step. Do not output JSON or tool-call syntax.',
      ].filter(Boolean).join('\n\n');

      const followupController = new AbortController();
      const followupTimeoutId = setTimeout(() => {
        followupController.abort();
      }, AI_TIMEOUT_MS);

      let followupResponse: Response;
      try {
        followupResponse = await aiClient.requestChatCompletions({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: nextFullSystemPrompt },
            ...body.messages.map((message) => ({ role: message.role, content: message.content })),
          ],
        }, followupController.signal);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw createAiDebugError(
            'AI follow-up request timed out after successful tool extraction.',
            'ai_followup_timeout',
            {
              mode: options.mode,
              timeoutMs: AI_TIMEOUT_MS,
            }
          );
        }
        throw error;
      } finally {
        clearTimeout(followupTimeoutId);
      }

      if (!followupResponse.ok) {
        const errorText = await followupResponse.text().catch(() => '');
        throw createAiDebugError(
          'AI follow-up request failed after successful tool extraction.',
          'ai_followup_request_failed',
          {
            mode: options.mode,
            status: followupResponse.status,
            body: errorText,
          }
        );
      }

      const payload = await followupResponse.json().catch(() => null) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      } | null;
      const rawContent = payload?.choices?.[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent.trim() : '';
      if (!content) {
        throw createAiDebugError(
          'AI follow-up request returned no user-facing reply.',
          'ai_followup_empty_reply',
          {
            mode: options.mode,
            payload,
          }
        );
      }
      return content;
    };

    const startedAt = Date.now();

      // Add timeout for the initial AI request
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        controller.abort();
      }, AI_TIMEOUT_MS);

    try {
      const debugEnabled = isDebugEnabled(env.DEBUG);
      if (isIntakeMode || isOnboardingMode) {
        Logger.info('AI tool request summary', {
          conversationId: body.conversationId,
          model,
          mode: effectiveMode ?? null,
          isIntakeMode,
          isOnboardingMode,
          toolNames: Array.isArray(requestPayload.tools)
            ? requestPayload.tools
                .map((tool) => (tool as { function?: { name?: string } }).function?.name ?? null)
                .filter((name): name is string => Boolean(name))
            : [],
          hasStoredIntakeState: Boolean(storedIntakeState),
          hasSlimContactDraft,
          intakeBriefActive,
          messageCount: body.messages.length,
          ...(debugEnabled ? { lastUserMessagePreview: lastUserMessage?.content?.slice(0, 120) ?? null } : {}),
        });
      }

      const aiResponse = await aiClient.requestChatCompletions(requestPayload, controller.signal);
      
      // Clear timeout once headers are received
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
      const shouldStreamTokensToUser = !isOnboardingMode;
      const streamResult = await consumeAiStream(aiResponse, shouldStreamTokensToUser, write, body.conversationId);
      const latencyMs = Date.now() - startedAt;

      Logger.info('AI response complete', {
        conversationId: body.conversationId,
        model: model,
        aigStep,
        latencyMs,
        emittedToken: streamResult.emittedToken,
        streamStalled: streamResult.streamStalled,
        hasToolCalls: streamResult.toolCalls.length > 0,
        toolCallCount: streamResult.toolCalls.length,
        replyLength: streamResult.reply.length,
        contentType: aiResponse.headers.get('content-type') ?? null,
        diagnostics: debugEnabled
          ? streamResult.diagnostics
          : {
              chunkCount: streamResult.diagnostics.chunkCount,
              parsedChunkCount: streamResult.diagnostics.parsedChunkCount,
              malformedChunkCount: streamResult.diagnostics.malformedChunkCount,
              contentChunkCount: streamResult.diagnostics.contentChunkCount,
              deltaToolCallChunkCount: streamResult.diagnostics.deltaToolCallChunkCount,
              namedToolFragmentCount: streamResult.diagnostics.namedToolFragmentCount,
              argumentOnlyToolFragmentCount: streamResult.diagnostics.argumentOnlyToolFragmentCount,
              finishReasonCount: streamResult.diagnostics.finishReasons.length,
              hasToolSamples: streamResult.diagnostics.sampleToolChunks.length > 0,
              hasUnexpectedSamples: streamResult.diagnostics.sampleUnexpectedChunks.length > 0,
            },
      });

      accumulatedReply = streamResult.reply;
      
      // Only log AI preview in debug mode to avoid PII leakage
      if (isDebugEnabled(env.DEBUG)) {
        Logger.info('AI raw reply preview', {
          conversationId: body.conversationId,
          replyPreview: accumulatedReply.slice(0, 100),
        });
      }
      emittedAnyToken = streamResult.emittedToken;

      // Parse accumulated tool calls if present
      for (const toolCall of streamResult.toolCalls) {
        if (toolCall.name === 'update_intake_fields' && toolCall.arguments.length > 0) {
          try {
            const rawParams = JSON.parse(toolCall.arguments);
            intakeFields = normalizeKeys(rawParams) as Record<string, unknown>;
          } catch (error) {
            Logger.warn('Failed to parse streamed intake tool arguments', {
              conversationId: body.conversationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        } else if (toolCall.name === 'update_practice_fields' && toolCall.arguments.length > 0) {
          try {
            const rawParams = JSON.parse(toolCall.arguments);
            onboardingFields = normalizeKeys(rawParams) as Record<string, unknown>;
          } catch (error) {
            Logger.warn('Failed to parse streamed onboarding tool arguments', {
              conversationId: body.conversationId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      // Post-process reply — same validation logic as the non-streaming path
      if (!accumulatedReply.trim()) {
        if (isIntakeMode && intakeFields) {
          accumulatedReply = await requestFollowupUserFacingReply({
            mode: 'intake',
            intakeFields,
          });
        } else if (isOnboardingMode && onboardingFields) {
          accumulatedReply = await requestFollowupUserFacingReply({
            mode: 'onboarding',
            onboardingFields,
          });
        }
      }

      if (!accumulatedReply.trim()) {
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
            hasIntakeFields: Boolean(intakeFields),
            hasOnboardingFields: Boolean(onboardingFields),
            streamStalled: streamResult.streamStalled,
            diagnostics: streamResult.diagnostics,
          }
        );
      }

      // Final cleanup of accumulatedReply to strip any leaked tool calls
      // that might have arrived in the text stream but weren't caught by the delta-parsing logic.
      const looksLikeLeakedToolContent =
        accumulatedReply.includes('update_intake_fields') ||
        accumulatedReply.includes('update_practice_fields') ||
        accumulatedReply.includes('"caseStrength"') ||
        accumulatedReply.includes('"practiceArea"') ||
        accumulatedReply.includes('"opposingParty"') ||
        accumulatedReply.includes('"desiredOutcome"') ||
        accumulatedReply.includes('"completionScore"') ||
        accumulatedReply.includes('"missingFields"') ||
        accumulatedReply.includes('```json') ||
        accumulatedReply.includes('"practice_area"') ||
        accumulatedReply.includes('"case_strength"') ||
        accumulatedReply.includes('"missing_summary"');

      if (looksLikeLeakedToolContent) {
        const finalParsing = parseToolCallFromReply(accumulatedReply);
        if (finalParsing) {
          if (finalParsing.parameters) {
            if (finalParsing.name === 'update_intake_fields') {
              intakeFields = { ...(intakeFields ?? {}), ...finalParsing.parameters };
            } else if (finalParsing.name === 'update_practice_fields') {
              onboardingFields = { ...(onboardingFields ?? {}), ...finalParsing.parameters };
            }
          }
          if (finalParsing.contentBuffer && finalParsing.contentBuffer.trim().length > 0) {
            accumulatedReply = finalParsing.contentBuffer;
          } else {
            if (isIntakeMode && intakeFields) {
              accumulatedReply = await requestFollowupUserFacingReply({
                mode: 'intake',
                intakeFields,
              });
            } else if (isOnboardingMode && onboardingFields) {
              accumulatedReply = await requestFollowupUserFacingReply({
                mode: 'onboarding',
                onboardingFields,
              });
            } else {
              throw createAiDebugError(
                'AI returned tool-call content without a user-facing reply.',
                'ai_tool_only_reply',
                {
                  mode: effectiveMode ?? null,
                  isIntakeMode,
                  isOnboardingMode,
                  toolName: finalParsing.name ?? null,
                  hasParsedParameters: Boolean(finalParsing.parameters),
                  streamStalled: streamResult.streamStalled,
                  diagnostics: streamResult.diagnostics,
                }
              );
            }
          }
        }
      }

      if (accumulatedReply.trim().length > 0) {
        const violations: string[] = [];
        if (
          shouldRequireDisclaimer(body.messages) &&
          !normalizeApostrophes(accumulatedReply).toLowerCase().includes(normalizeApostrophes(LEGAL_DISCLAIMER).toLowerCase())
        ) {
          violations.push('missing_disclaimer');
        }
        if (!isIntakeMode && !isOnboardingMode && countQuestions(accumulatedReply) > 1) {
          violations.push('too_many_questions');
        }
        if (violations.length > 0) {
          Logger.warn('AI response violated prompt contract', {
            conversationId: body.conversationId,
            violations
          });
          throw createAiDebugError(
            `AI response violated prompt contract: ${violations.join(', ')}`,
            'ai_prompt_contract_violation',
            {
              mode: effectiveMode ?? null,
              violations,
              ...(isDebugEnabled(env.DEBUG)
                ? { replyPreview: accumulatedReply.slice(0, 300) }
                : {}),
            }
          );
        }
      }

      if (!emittedAnyToken && accumulatedReply.trim()) {
        write({ token: accumulatedReply });
        emittedAnyToken = true;
      }

      const fieldsForQuickReplies = isIntakeMode ? intakeFields : (isOnboardingMode ? onboardingFields : null);
      // Extract quickReplies from structured tool fields before persisting
      if (fieldsForQuickReplies && Array.isArray(fieldsForQuickReplies.quickReplies)) {
        quickReplies = (fieldsForQuickReplies.quickReplies as unknown[])
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
      if (onboardingFields && 'quickReplies' in onboardingFields) {
        const { quickReplies: _q, ...rest } = onboardingFields as Record<string, unknown>;
        onboardingFields = rest;
      }
      let triggerEditModal: string | null = null;
      if (onboardingFields && 'triggerEditModal' in onboardingFields) {
        triggerEditModal = onboardingFields.triggerEditModal as string;
        const { triggerEditModal: _t, ...rest } = onboardingFields as Record<string, unknown>;
        onboardingFields = rest;
      }
      if (isOnboardingMode) {
        onboardingProfile = buildOnboardingProfileMetadata(details, onboardingFields);
      }
      if (intakeFields && typeof intakeFields.practiceArea === 'string') {
        const matched = servicesForPrompt.find((s) => s.key === intakeFields?.practiceArea);
        if (matched) intakeFields.practiceAreaName = matched.name;
      }
      let mergedIntakeState = mergeIntakeState(storedIntakeState, intakeFields);
      const resolvedPracticeName = readAnyString(details, ['name', 'practiceName', 'practice_name']) ?? 'the practice';

      if (isIntakeMode && !intakeFields) {
        throw createAiDebugError(
          'Intake AI reply completed without structured intake fields.',
          'ai_missing_intake_fields',
          {
            conversationId: body.conversationId,
            practiceId,
            mode: effectiveMode ?? null,
            lastUserMessage: debugEnabled ? lastUserMessage?.content?.slice(0, 200) ?? null : '[redacted]',
            aiReplyPreview: accumulatedReply.slice(0, 200),
            streamDiagnostics: streamResult.diagnostics,
            practiceContactErrorReply: buildPracticeContactErrorReply(resolvedPracticeName, details),
          }
        );
      }

      const shouldPromptConsultation =
        !hasSlimContactDraft &&
        (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(accumulatedReply));

      const intakeCaseStrength = typeof intakeFields?.caseStrength === 'string'
        ? intakeFields.caseStrength
        : null;
      const replyHasIntakePrompt = shouldShowIntakeCtaForReply(accumulatedReply);
      const deterministicReady = isIntakeMode && shouldShowDeterministicIntakeCta(mergedIntakeState);

      const shouldForceIntakeSummary =
        isIntakeMode &&
        deterministicReady &&
        !replyHasIntakePrompt &&
        countQuestions(accumulatedReply) === 0 &&
        mergedIntakeState?.ctaShown !== true;

      if (shouldForceIntakeSummary) {
        intakeFields = { ...(intakeFields ?? {}), ctaShown: true };
        mergedIntakeState = mergeIntakeState(storedIntakeState, intakeFields);
      }

      const shouldShowIntakeCta =
        isIntakeMode &&
        replyHasIntakePrompt &&
        (deterministicReady || intakeCaseStrength === 'developing' || intakeCaseStrength === 'strong');
      const forcedSummaryContent = shouldForceIntakeSummary
        ? buildIntakeSummaryFromState(mergedIntakeState)
        : null;

      // Emit the done event before persisting — client can act on intakeFields
      // immediately without waiting for the DB write
      write({
        done: true,
        intakeFields: intakeFields ?? null,
        onboardingFields: onboardingFields ?? null,
        onboardingProfile: onboardingProfile ?? null,
        quickReplies: quickReplies ?? null,
        triggerEditModal: triggerEditModal ?? null,
      });

      // Persist and audit — runs inside waitUntil so the worker stays alive
      // until this completes even after the SSE stream is closed
      const storedMessage = await conversationService.sendSystemMessage({
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        content: accumulatedReply,
        metadata: {
          source: 'ai',
          model: model,
          ...(aigStep ? { aigStep } : {}),
          ...(intakeFields ? { intakeFields } : {}),
          ...(onboardingFields ? { onboardingFields } : {}),
          ...(onboardingProfile ? { onboardingProfile } : {}),
          ...(quickReplies ? { quickReplies } : {}),
          ...(triggerEditModal ? { triggerEditModal } : {}),
          ...(isIntakeMode && shouldShowIntakeCta ? { intakeReadyCta: true } : {}),
          ...(shouldPromptConsultation
            ? { modeSelector: { showAskQuestion: false, showRequestConsultation: true, source: 'ai' } }
            : {})
        },
        recipientUserId: authContext.user.id,
        skipPracticeValidation: shouldSkipPracticeValidation,
        request
      });

      if (forcedSummaryContent) {
        const forcedSummaryMessage = await conversationService.sendSystemMessage({
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          content: forcedSummaryContent,
          metadata: {
            source: 'ai',
            model,
            intakeReadyCta: true,
          },
          recipientUserId: authContext.user.id,
          skipPracticeValidation: true,
          request
        });
        if (forcedSummaryMessage) {
          write({ 
            persisted: true, 
            messageId: forcedSummaryMessage.id,
            content: forcedSummaryContent,
            metadata: forcedSummaryMessage.metadata
          });
        }
      }

      if (storedMessage) {
        // Persist the merged intake state back to the conversation metadata
        // so that it persists across devices/refreshes.
        if (isIntakeMode && mergedIntakeState) {
          const updateMetadata = async (attempts = 0) => {
            try {
              await conversationService.mergeConsultationMetadata(
                body.conversationId,
                conversation.practice_id,
                {
                  case: mergedIntakeState,
                  status: consultation?.status === 'ready_to_submit'
                    || mergedIntakeState.ctaResponse === 'ready'
                    ? 'ready_to_submit'
                    : 'collecting_case',
                },
                { repair: true }
              );
            } catch (metadataError) {
              if (attempts < 1) {
                // One retry for concurrent modification or transient errors
                await updateMetadata(attempts + 1);
              } else {
                Logger.warn('Failed to persist merged intake state to conversation metadata after retries', {
                  conversationId: body.conversationId,
                  error: metadataError instanceof Error ? metadataError.message : String(metadataError)
                });
              }
            }
          };
          await updateMetadata();
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
      // Clear timeout if still active
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Handle abort errors specifically
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
      close();
    }
  };

  if (ctx) {
    ctx.waitUntil(streamAndPersist(env));
  } else {
    // Fallback for environments without ExecutionContext (tests, local dev without miniflare)
    streamAndPersist(env).catch((error) => {
      Logger.warn('streamAndPersist uncaught error', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return sseResponse;
}
