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
  INTAKE_TOOL,
  buildIntakeSystemPrompt,
  buildIntakeConversationStablePrompt,
  buildIntakeConversationStatePrompt,
  mergeIntakeState,
  planNextIntakeStep,
  isIntakeSubmittable,
  type IntakeSubmissionGate,
  normalizeServicesForPrompt,
  extractServiceNames,
  formatServiceList,
  shouldRequireDisclaimer,
  deriveDeterministicIntakePatchFromLatestMessage,
  buildCompactPracticeContextForPrompt,
} from './aiChatIntake.js';

import {
  ONBOARDING_TOOL,
  buildOnboardingSystemPrompt,
  buildOnboardingProfileMetadata,
} from './aiChatOnboarding.js';

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
  const prefillAmount = readFiniteNumberField(details, [
    'paymentLinkPrefillAmount',
    'payment_link_prefill_amount',
    'prefillAmount',
    'prefill_amount',
  ]);
  if (prefillAmount !== null && prefillAmount > 0) return true;

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

const buildCompactIntakeContextForExtraction = (
  state: Record<string, unknown> | null
): Record<string, unknown> | null => {
  if (!state) return null;
  const compact: Record<string, unknown> = {};
  const copyString = (key: string, maxLen = 180) => {
    const value = state[key];
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    compact[key] = trimmed.slice(0, maxLen);
  };
  const copyBoolean = (key: string) => {
    if (typeof state[key] === 'boolean') compact[key] = state[key];
  };

  copyString('practiceArea', 80);
  copyString('description', 220);
  copyString('city', 80);
  copyString('state', 2);

  copyString('opposingParty', 120);
  copyString('urgency', 30);
  copyString('desiredOutcome', 180);
  copyString('courtDate', 20);
  copyBoolean('hasDocuments');

  return Object.keys(compact).length > 0 ? compact : null;
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
      { repair: true }
    );
  } catch (metadataError) {
    if (attempts < 1) {
      // One retry for concurrent modification or transient errors.
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

const extractIntakeFieldsForTurn = async (params: {
  aiClient: ReturnType<typeof createAiClient>;
  model: string;
  servicesForPrompt: Array<{ name: string; key: string }>;
  storedIntakeState: Record<string, unknown> | null;
  body: {
    conversationId: string;
    extractionMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
    fullMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
  deterministicIntakePatch: Record<string, unknown> | null;
  skipExtractionReason?: string | null;
  debugEnabled: boolean;
  lastUserMessage: { role: 'user' | 'assistant'; content: string } | undefined;
  metrics?: {
    extractionRan: boolean;
    extractionElapsedMs: number | null;
    skipReason: string | null;
    deterministicPatchKeys: string[];
  };
}): Promise<Record<string, unknown> | null> => {
  if (params.deterministicIntakePatch) {
    if (params.metrics) {
      params.metrics.skipReason = 'deterministic_patch';
      params.metrics.deterministicPatchKeys = Object.keys(params.deterministicIntakePatch);
    }
    if (params.debugEnabled) {
      Logger.info('AI chat timing: intake extraction skipped via deterministic patch', {
        conversationId: params.body.conversationId,
        patchKeys: Object.keys(params.deterministicIntakePatch),
      });
    }
    return params.deterministicIntakePatch;
  }
  if (params.skipExtractionReason) {
    if (params.metrics) {
      params.metrics.skipReason = params.skipExtractionReason;
      params.metrics.deterministicPatchKeys = [];
    }
    if (params.debugEnabled) {
      Logger.info('AI chat timing: intake extraction skipped by classifier', {
        conversationId: params.body.conversationId,
        reason: params.skipExtractionReason,
      });
    }
    return null;
  }

  const extractionStartedAt = Date.now();
  if (params.metrics) {
    params.metrics.extractionRan = true;
    params.metrics.extractionElapsedMs = null;
    params.metrics.skipReason = null;
    params.metrics.deterministicPatchKeys = [];
  }
  let extractionOutcome: 'ok' | 'no_args' | 'parse_failed' | 'http_error' | 'exception' = 'ok';
  const extractionSystemPrompt = [
    buildIntakeSystemPrompt(params.servicesForPrompt),
    (() => {
      const compact = buildCompactIntakeContextForExtraction(params.storedIntakeState);
      return compact ? `INTAKE_CONTEXT: ${JSON.stringify(compact)}` : null;
    })(),
  ].filter(Boolean).join('\n\n');

  const attemptExtraction = async (
    messagesWindow: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ parsed: Record<string, unknown> | null; rawArgs?: string | null; finishReason?: string | null; contentPreview?: string; toolCallCount?: number } | null> => {
    const extractionPayload: Record<string, unknown> = {
      model: params.model,
      temperature: 0.1,
      stream: false,
      tools: [INTAKE_TOOL],
      tool_choice: { type: 'function', function: { name: 'update_intake_fields' } },
      parallel_tool_calls: false,
      messages: [
        { role: 'system', content: extractionSystemPrompt },
        ...messagesWindow.map((m) => ({ role: m.role, content: m.content })),
      ],
    };

    const extractionController = new AbortController();
    const extractionTimeoutId = setTimeout(() => extractionController.abort(), AI_TIMEOUT_MS);

    try {
      const extractionResponse = await params.aiClient.requestChatCompletions(extractionPayload, extractionController.signal);

      if (!extractionResponse.ok) {
        extractionOutcome = 'http_error';
        Logger.warn('Intake extraction call failed', {
          conversationId: params.body.conversationId,
          status: extractionResponse.status,
        });
        return null;
      }

      const extractionData = await extractionResponse.json().catch(() => null) as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{
              function?: { name?: string; arguments?: string };
            }>;
            content?: string | null;
          };
          finish_reason?: string | null;
        }>;
      } | null;

      const toolCallArgs = extractionData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const rawArgs = typeof toolCallArgs === 'string' && toolCallArgs.length > 0 ? toolCallArgs : null;

      if (typeof rawArgs !== 'string' || rawArgs.length === 0) {
        extractionOutcome = 'no_args';
        return {
          parsed: null,
          finishReason: extractionData?.choices?.[0]?.finish_reason ?? null,
          toolCallCount: Array.isArray(extractionData?.choices?.[0]?.message?.tool_calls)
            ? extractionData.choices[0].message.tool_calls.length
            : 0,
          rawArgs: null,
          contentPreview: params.debugEnabled && typeof extractionData?.choices?.[0]?.message?.content === 'string'
            ? extractionData.choices[0].message.content.slice(0, 300)
            : undefined,
        };
      }

      try {
        let cleanArgs = rawArgs.trim();
        const xmlMatch = cleanArgs.match(/<tool_call[^>]*>([\s\S]*?)<\/tool_call>/i);
        if (xmlMatch) cleanArgs = xmlMatch[1].trim();
        const fenceMatch = cleanArgs.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenceMatch) cleanArgs = fenceMatch[1].trim();
        const parsed = normalizeKeys(JSON.parse(cleanArgs)) as Record<string, unknown>;
        return { parsed, rawArgs };
      } catch (parseError) {
        extractionOutcome = 'parse_failed';
        Logger.warn('Failed to parse extraction tool call arguments', {
          conversationId: params.body.conversationId,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          ...(params.debugEnabled ? { rawToolArgsLength: rawArgs.length } : {}),
        });
        return null;
      }
    } catch (error) {
      extractionOutcome = 'exception';
      Logger.warn('Intake extraction failed', {
        conversationId: params.body.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(extractionTimeoutId);
    }
  };

  try {
    let result = await attemptExtraction(params.body.extractionMessages);

    const isSemanticallyEmptyExtraction = !!result?.parsed && Object.keys(result.parsed).length === 0;
    
    if (isSemanticallyEmptyExtraction && params.body.fullMessages && params.body.fullMessages.length > 2) {
      const INTAKE_FIELDS_ALLOWLIST = ['practiceArea', 'description', 'urgency', 'opposingParty', 'city', 'state', 'desiredOutcome', 'courtDate', 'hasDocuments'];
      const populatedFieldCount = params.storedIntakeState
        ? Object.entries(params.storedIntakeState).filter(([k, v]) => INTAKE_FIELDS_ALLOWLIST.includes(k) && v !== null && v !== undefined && v !== '').length
        : 0;
        
      if (populatedFieldCount < 3) {
        if (params.debugEnabled) {
          Logger.info('AI chat timing: intake extraction widening window and retrying', {
            conversationId: params.body.conversationId,
            populatedFieldCount,
          });
        }
        extractionOutcome = 'ok';
        const widerWindow = buildExtractionMessagesWindow(params.body.fullMessages, 4);
        result = await attemptExtraction(widerWindow);
      }
    }

    if (result && !result.parsed && result.rawArgs === null) {
      Logger.warn('Intake extraction missing tool call arguments', {
        conversationId: params.body.conversationId,
        finishReason: result.finishReason,
        toolCallCount: result.toolCallCount,
        ...(result.contentPreview ? { messageContentLength: result.contentPreview.length } : {}),
      });
      return null;
    }

    return result?.parsed ?? null;
  } finally {
    if (params.metrics) {
      params.metrics.extractionElapsedMs = Date.now() - extractionStartedAt;
    }
    Logger.info('AI chat timing: intake extraction finished', {
      conversationId: params.body.conversationId,
      elapsedMs: Date.now() - extractionStartedAt,
      outcome: extractionOutcome,
    });
  }
};

const buildExtractionMessagesWindow = (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  windowSize = 2
): Array<{ role: 'user' | 'assistant'; content: string }> => {
  if (messages.length === 0) return [];
  const lastUserIndex = [...messages].reverse().findIndex((m) => m.role === 'user');
  if (lastUserIndex === -1) return messages.slice(-windowSize);
  const absoluteLastUserIndex = messages.length - 1 - lastUserIndex;

  if (windowSize === 2) {
    const latestUser = messages[absoluteLastUserIndex];
    const priorAssistant = messages
      .slice(0, absoluteLastUserIndex)
      .reverse()
      .find((m) => m.role === 'assistant');

    return priorAssistant
      ? [priorAssistant, latestUser]
      : [latestUser];
  }

  const endIndex = absoluteLastUserIndex + 1;
  const startIndex = Math.max(0, endIndex - windowSize);
  return messages.slice(startIndex, endIndex);
};

const classifyExtractionNeed = (params: {
  isIntakeMode: boolean;
  latestUserMessage: string | undefined;
  plannerStep: ReturnType<typeof planNextIntakeStep>;
  deterministicIntakePatch: Record<string, unknown> | null;
}): string | null => {
  if (!params.isIntakeMode) return 'not_intake_mode';
  if (params.deterministicIntakePatch) return null;
  const latest = (params.latestUserMessage ?? '').trim();
  if (!latest) return 'empty_latest_message';

  if (HOURS_QUESTION_REGEX.test(latest)) return 'operational_hours_question';
  if (SERVICE_QUESTION_REGEX.test(latest)) return 'operational_service_question';
  if (CONSULTATION_CTA_REGEX.test(latest)) return 'consultation_cta_phrase';

  if (latest.includes('?')) return 'user_question_turn';

  const normalized = latest.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').trim();
  if (/^(ok|okay|thanks|thank you|got it|sounds good|understood|cool|sure|fine)$/.test(normalized)) {
    return 'ack_only_turn';
  }
  if (
    params.plannerStep.nextField === null
    && /^(yes|ready|submit|go ahead|sounds good|looks good|correct)$/.test(normalized)
  ) {
    return 'submit_confirmation_turn';
  }

  // Keep extractor for freeform and multi-fact replies by default.
  return null;
};

const resolveExtractionServicesForTurn = (
  servicesForPrompt: Array<{ name: string; key: string }>,
  storedIntakeState: Record<string, unknown> | null
): Array<{ name: string; key: string }> => {
  if (!storedIntakeState) return servicesForPrompt;
  const knownPracticeArea = typeof storedIntakeState.practiceArea === 'string'
    ? storedIntakeState.practiceArea.trim()
    : '';
  if (!knownPracticeArea) return servicesForPrompt;
  const matchingService = servicesForPrompt.find((service) => service.key === knownPracticeArea);
  return matchingService ? [matchingService] : servicesForPrompt;
};

const deriveQuickActionState = (params: {
  isOnboardingMode: boolean;
  onboardingFields: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
}) => {
  let onboardingFields = params.onboardingFields;
  let quickReplies: string[] | null = null;
  let quickRepliesSource: 'none' | 'onboardingFields' | 'planner_urgency' | 'planner_hasDocuments' | 'planner_payment' | 'planner_submit' | 'self_annotation' = 'none';
  let onboardingProfile: Record<string, unknown> | null = null;
  let triggerEditModal: string | null = null;

  const fieldsForQuickReplies = params.isOnboardingMode ? onboardingFields : null;
  if (fieldsForQuickReplies && Array.isArray(fieldsForQuickReplies.quickReplies)) {
    quickReplies = (fieldsForQuickReplies.quickReplies as unknown[])
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .slice(0, 3);
    if (quickReplies.length === 0) quickReplies = null;
    if (quickReplies) quickRepliesSource = 'onboardingFields';
  }
  if (onboardingFields && 'quickReplies' in onboardingFields) {
    const { quickReplies: _q, ...rest } = onboardingFields as Record<string, unknown>;
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
    quickReplies,
    quickRepliesSource,
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

  const conversationService = new ConversationService(env);
  const conversation = await conversationService.getConversationById(body.conversationId, { repair: true });
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

  const auditService = new SessionAuditService(env);
  await auditService.createEvent({
    conversationId: body.conversationId,
    practiceId,
    eventType: 'ai_message_sent',
    actorType: 'user',
    actorId: authContext.user.id,
    payload: { conversationId: body.conversationId }
  });
  Logger.info('AI chat timing: user audit event created', {
    conversationId: body.conversationId,
    elapsedMs: Date.now() - requestStartedAt,
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
    Logger.info('AI chat timing: practice details loaded', {
      conversationId: body.conversationId,
      practiceId,
      elapsedMs: Date.now() - requestStartedAt,
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
              consultation.submission != null
              && typeof consultation.submission.intakeUuid === 'string'
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

  // ------------------------------------------------------------------
  // Short-circuit paths — instant replies that don't need streaming.
  // These return a JSON response identical to the old format so any
  // legacy client code that hasn't been updated yet still works.
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
  // Streaming path — calls Workers AI with stream:true, pipes tokens to the
  // client via SSE, then persists the completed message via waitUntil.
  // ------------------------------------------------------------------

  const aiPromptContext = buildCompactPracticeContextForPrompt(details);
  const aiClient = createAiClient(env);
  const model = DEFAULT_AI_MODEL;

  const servicesForPrompt = normalizeServicesForPrompt(details);
  const onboardingPromptProfile = isOnboardingMode
    ? buildOnboardingProfileMetadata(details, null)
    : null;
  const requestPayload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    stream: true,
    messages: [],
  };

  if (!isIntakeMode) {
    const nonIntakeSystemPrompt = isOnboardingMode
      ? buildOnboardingSystemPrompt(onboardingPromptProfile)
      : [
        'You are an intake assistant for a law practice website.',
        'You may answer only operational questions using provided practice details.',
        `If user asks for legal advice: respond with the exact sentence: "${LEGAL_DISCLAIMER}" and recommend consultation.`,
        'Ask only ONE clarifying question max per assistant message.',
        'If you don\'t have practice details: say you don\'t have access and recommend consultation.',
      ].join('\n');

    const stableSystemPrompt = [
      nonIntakeSystemPrompt,
      `PRACTICE_CONTEXT: ${JSON.stringify(aiPromptContext)}`,
    ].join('\n\n');

    requestPayload.messages = [
      { role: 'system', content: stableSystemPrompt },
      ...(body.additionalContext
        ? [{ role: 'system' as const, content: `SEARCH_CONTEXT: ${body.additionalContext}` }]
        : []),
      ...body.messages.map((message) => ({ role: message.role, content: message.content })),
    ];
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

  // Kick off the async work and register it with ctx.waitUntil so Cloudflare
  // does not terminate the worker before persistence completes.
  const streamAndPersist = async (env: Env) => {
    let accumulatedReply = '';
    let intakeFields: Record<string, unknown> | null = null;
    let onboardingFields: Record<string, unknown> | null = null;
    let emittedAnyToken = false;
    const debugEnabled = isDebugEnabled(env.DEBUG);

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
        if (debugEnabled) {
          Logger.info('AI tool request summary', {
            conversationId: body.conversationId,
            model,
            mode: effectiveMode ?? null,
            isIntakeMode,
            isOnboardingMode,
            toolNames,
            messageCount: body.messages.length,
            hasStoredIntakeState: Boolean(storedIntakeState),
            hasSlimContactDraft,
            intakeBriefActive,
          });
        } else {
          Logger.info('AI tool request summary', {
            conversationId: body.conversationId,
            mode: effectiveMode ?? null,
            isIntakeMode,
            isOnboardingMode,
            toolNames,
            messageCount: body.messages.length,
          });
        }
      }

      const deterministicIntakePatch = isIntakeMode
        ? deriveDeterministicIntakePatchFromLatestMessage(lastUserMessage?.content, storedIntakeState, {
            paymentRequiredBeforeSubmit:
              (consultation?.submission?.paymentRequired === true)
              || resolvePracticeRequiresPaymentBeforeSubmission(details),
            paymentCompleted: consultation?.submission?.paymentReceived === true,
          })
        : null;
      const intakeSubmissionGate: IntakeSubmissionGate = {
        paymentRequiredBeforeSubmit:
          (consultation?.submission?.paymentRequired === true)
          || resolvePracticeRequiresPaymentBeforeSubmission(details),
        paymentCompleted: consultation?.submission?.paymentReceived === true,
      };
      const extractionPlannerStep = planNextIntakeStep(storedIntakeState, intakeSubmissionGate);
      const intakeTurnMetrics = isIntakeMode
        ? {
            extractionRan: false,
            extractionElapsedMs: null as number | null,
            skipReason: null as string | null,
            deterministicPatchKeys: deterministicIntakePatch ? Object.keys(deterministicIntakePatch) : [],
            plannerNextField: extractionPlannerStep.nextField,
            conversationTTFTMs: null as number | null,
            conversationTotalResponseMs: null as number | null,
            totalTurnMs: null as number | null,
          }
        : null;
      const skipExtractionReason = classifyExtractionNeed({
        isIntakeMode,
        latestUserMessage: lastUserMessage?.content,
        plannerStep: extractionPlannerStep,
        deterministicIntakePatch,
      });
      const extractionServicesForPrompt = resolveExtractionServicesForTurn(
        servicesForPrompt,
        storedIntakeState,
      );
      const extractionMessages = buildExtractionMessagesWindow(body.messages);

      const extractionPromise: Promise<Record<string, unknown> | null> = isIntakeMode
        ? extractIntakeFieldsForTurn({
            aiClient,
            model,
            servicesForPrompt: extractionServicesForPrompt,
            storedIntakeState,
            body: {
              conversationId: body.conversationId,
              extractionMessages,
              fullMessages: body.messages,
            },
            deterministicIntakePatch,
            skipExtractionReason,
            debugEnabled,
            lastUserMessage,
            metrics: intakeTurnMetrics ?? undefined,
          })
        : Promise.resolve(null);

      let intakeFieldsFromExtraction: Record<string, unknown> | null = null;
      let promptMergedIntakeState: Record<string, unknown> | null = storedIntakeState;
      if (isIntakeMode) {
        intakeFieldsFromExtraction = await extractionPromise;
        promptMergedIntakeState = mergeIntakeState(storedIntakeState, intakeFieldsFromExtraction);
        const intakeStablePrompt = [
          buildIntakeConversationStablePrompt(servicesForPrompt),
          `PRACTICE_CONTEXT: ${JSON.stringify(aiPromptContext)}`,
        ].join('\n\n');
        const intakeDynamicPrompt = [
          buildIntakeConversationStatePrompt(servicesForPrompt, promptMergedIntakeState, body.messages.length, intakeSubmissionGate),
          body.additionalContext ? `SEARCH_CONTEXT: ${body.additionalContext}` : null,
        ].filter(Boolean).join('\n\n');

        requestPayload.messages = [
          { role: 'system', content: intakeStablePrompt },
          ...(intakeDynamicPrompt
            ? [{ role: 'system' as const, content: intakeDynamicPrompt }]
            : []),
          ...body.messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        delete requestPayload.tools;
        delete requestPayload.tool_choice;
        delete requestPayload.parallel_tool_calls;
      }

      const conversationRequestStartedAt = Date.now();
      let conversationTTFTMs: number | null = null;
      // Conversation timeout should start only when the conversation request starts,
      // not during intake pre-processing/extraction work.
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
      
      const streamResult = await consumeAiStream(aiResponse, shouldStreamTokensToUser, streamWrite, body.conversationId);
      const conversationTotalResponseMs = Date.now() - conversationRequestStartedAt;
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
              finishReasonCount: streamResult.diagnostics.finishReasons.length,
            },
      });

      accumulatedReply = streamResult.reply;
      emittedAnyToken = streamResult.emittedToken;

      // Parse accumulated tool calls if present
      for (const toolCall of streamResult.toolCalls) {
        if (toolCall.name === 'update_practice_fields' && toolCall.arguments.length > 0) {
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

      if (!emittedAnyToken && accumulatedReply.trim()) {
        write({ token: accumulatedReply });
        emittedAnyToken = true;
        if (conversationTTFTMs === null) {
          conversationTTFTMs = Date.now() - conversationRequestStartedAt;
        }
      }

      // ── Deterministic chip planner ─────────────────────────────────────────
      // Chips are NEVER derived from model output. The planner exclusively
      // inspects merged state and maps to closed-choice fields (urgency, hasDocuments)
      // or emits nothing for open-text fields (description, location, etc.).
      // The model-authored quickReplies field no longer exists in INTAKE_TOOL.
      // ─────────────────────────────────────────────────────────────────────────

      let onboardingProfile: Record<string, unknown> | null = null;
      let triggerEditModal: string | null = null;
      let quickReplies: string[] | null = null;
      let quickRepliesSource: 'none' | 'onboardingFields' | 'planner_urgency' | 'planner_hasDocuments' | 'planner_payment' | 'planner_submit' | 'self_annotation' = 'none';
      let plannerStep: ReturnType<typeof planNextIntakeStep> | null = null;

      if (isOnboardingMode) {
        const quickActionState = deriveQuickActionState({
          isOnboardingMode,
          onboardingFields,
          details,
        });

        onboardingFields = quickActionState.onboardingFields;
        onboardingProfile = quickActionState.onboardingProfile;
        triggerEditModal = quickActionState.triggerEditModal;
        quickReplies = quickActionState.quickReplies;
        quickRepliesSource = quickActionState.quickRepliesSource as typeof quickRepliesSource;
      }
      
      // --- Deterministic Intake Quick Action Override ---
      let intakeReady = false;
      if (isIntakeMode) {
        // ── Deterministic Intake Quick Action Planner ──────────────────────────
        // Ensure extraction results are fully loaded and merged before planning
        intakeFields = intakeFieldsFromExtraction ?? await extractionPromise;
        const mergedForPlanner = mergeIntakeState(storedIntakeState, intakeFields);
        plannerStep = planNextIntakeStep(mergedForPlanner, intakeSubmissionGate);
        intakeReady = isIntakeSubmittable(mergedForPlanner, intakeSubmissionGate);
        
        if (intakeReady) {
          quickReplies = ['__submit__'];
          quickRepliesSource = 'planner_submit';
          
          // Strip hallucinated QUICK_REPLIES if model produced them
          if (accumulatedReply.includes('QUICK_REPLIES:')) {
            const qrParts = accumulatedReply.split(/QUICK_REPLIES:\s*/i);
            if (qrParts.length > 1) {
              accumulatedReply = (qrParts[0].trim() + '\n' + qrParts[1].split('\n').slice(1).join('\n')).trim();
            }
          }
        } else {
          // 1. Foundation: Deterministic Planner Chips
          if (plannerStep.chips.length > 0) {
            quickReplies = plannerStep.chips;
            quickRepliesSource = plannerStep.chipSource === 'urgency'
              ? 'planner_urgency'
              : plannerStep.chipSource === 'hasDocuments'
                ? 'planner_hasDocuments'
                : plannerStep.chipSource === 'payment'
                  ? 'planner_payment'
                  : 'planner_hasDocuments';
          }
          
          // 2. Override: Self-Annotated
          // Format: QUICK_REPLIES: Option 1 | Option 2 | Option 3
          if (accumulatedReply.includes('QUICK_REPLIES:')) {
            const qrParts = accumulatedReply.split(/QUICK_REPLIES:\s*/i);
            if (qrParts.length > 1) {
              const rawOptions = qrParts[1].split('\n')[0].trim();
              const options = rawOptions
                .split('|')
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && s.length < 30)
                .filter((s) => !/^__\w+__$/.test(s)); // Sentinel filter
              
              if (options.length > 0 && !quickReplies) {
                quickReplies = options.slice(0, 3);
                quickRepliesSource = 'self_annotation';
              }
              // Strip the metadata line from the text users see for persistence/UI
              accumulatedReply = (qrParts[0].trim() + '\n' + qrParts[1].split('\n').slice(1).join('\n')).trim();
            }
          }
        }

        Logger.info('Quick replies applied for intake', {
          conversationId: body.conversationId,
          source: quickRepliesSource,
          quickRepliesCount: quickReplies?.length ?? 0,
          replyLength: accumulatedReply.length,
        });

        // HEURISTIC: Strip common extraction hallucinations (e.g. user circumstances captured as names)
        if (intakeFields?.opposingParty && typeof intakeFields.opposingParty === 'string') {
          const originalValue = intakeFields.opposingParty;
          const op = originalValue.toLowerCase();
          const keywords = ['urgent', 'hospital', 'incident'];
          const hitCount = keywords.filter(k => op.includes(k)).length;
          
          const looksLikeHallucination = 
            hitCount >= 2 || 
            (hitCount >= 1 && op.split(' ').length > 4);
          
          if (looksLikeHallucination) {
            Logger.warn('Stripping suspected opposingParty hallucination', {
              conversationId: body.conversationId,
              originalValueLength: originalValue.length,
              reason: hitCount >= 2 ? 'multiple_keywords' : 'keyword_and_sentence_structure',
              hitCount
            });
            delete intakeFields.opposingParty;
          }
        }

        intakeFields = {
          ...(intakeFields ?? {}),
          intakeReady,
          quickReplies: quickReplies ?? null,
        } as typeof intakeFields;
      }
      const mergedIntakeState = mergeIntakeState(storedIntakeState, intakeFields);
      if (isIntakeMode && debugEnabled) {
        Logger.info('Intake state before persistence', {
          conversationId: body.conversationId,
          intakeFieldsPresent: Boolean(intakeFields),
          mergedStatePresent: Boolean(mergedIntakeState),
          quickRepliesCount: quickReplies?.length ?? 0,
        });
      }
      if (isIntakeMode && !intakeFields) {
        Logger.warn('Intake extraction returned no fields — reply will proceed without structured data', {
          conversationId: body.conversationId,
        });
      }

      const shouldPromptConsultation =
        !hasSlimContactDraft &&
        (shouldRequireDisclaimer(body.messages) || CONSULTATION_CTA_REGEX.test(accumulatedReply));
      const includeQuickRepliesInMetadata = Boolean(quickReplies);

      if (debugEnabled) {
        Logger.info('[QuickActionDebug] aiChat computed action payload', {
          conversationId: body.conversationId,
          nextField: plannerStep?.nextField ?? null,
          isSubmitReady: plannerStep?.nextField === null,
          quickRepliesSource,
          chipSource: plannerStep?.chipSource ?? null,
          quickRepliesCount: quickReplies?.length ?? 0,
          includeQuickRepliesInMetadata,
          isIntakeMode,
          isOnboardingMode,
        });
      }

      if (isIntakeMode && intakeTurnMetrics) {
        intakeTurnMetrics.extractionRan = Boolean(intakeTurnMetrics.extractionRan);
        intakeTurnMetrics.conversationTTFTMs = conversationTTFTMs;
        intakeTurnMetrics.conversationTotalResponseMs = conversationTotalResponseMs;
        intakeTurnMetrics.totalTurnMs = Date.now() - startedAt;
        Logger.info('AI chat intake turn metrics', {
          conversationId: body.conversationId,
          extractionRan: intakeTurnMetrics.extractionRan,
          skipReason: intakeTurnMetrics.skipReason,
          deterministicPatchKeys: intakeTurnMetrics.deterministicPatchKeys,
          plannerNextField: intakeTurnMetrics.plannerNextField,
          extractionElapsedMs: intakeTurnMetrics.extractionElapsedMs,
          conversationTTFTMs: intakeTurnMetrics.conversationTTFTMs,
          conversationTotalResponseMs: intakeTurnMetrics.conversationTotalResponseMs,
          totalTurnMs: intakeTurnMetrics.totalTurnMs,
        });
      }

      // Emit the done event before persisting — client can act on intakeFields
      // immediately without waiting for the DB write.
      write({
        done: true,
        intakeFields: mergedIntakeState ?? null,
        onboardingFields: onboardingFields ?? null,
        onboardingProfile: onboardingProfile ?? null,
        quickReplies: quickReplies ?? null,
        triggerEditModal: triggerEditModal ?? null,
      });
      close();
      responseClosed = true;

      const postStreamTasks: Promise<unknown>[] = [];

      postStreamTasks.push((async () => {
        const storedMessage = await conversationService.sendSystemMessage({
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          content: accumulatedReply,
          metadata: {
            source: 'ai',
            model: model,
            ...(body.sourceBubbleId ? { sourceBubbleId: body.sourceBubbleId } : {}),
            ...(aigStep ? { aigStep } : {}),
            ...(intakeFields ? { intakeFields } : {}),
            ...(onboardingFields ? { onboardingFields } : {}),
            ...(onboardingProfile ? { onboardingProfile } : {}),
            ...(includeQuickRepliesInMetadata ? { quickReplies } : {}),
            ...(triggerEditModal ? { triggerEditModal } : {}),
            ...(shouldPromptConsultation
              ? { modeSelector: { showAskQuestion: false, showRequestConsultation: true, source: 'ai' } }
              : {})
          },
          recipientUserId: authContext.user.id,
          skipPracticeValidation: shouldSkipPracticeValidation,
          request
        });

        if (debugEnabled) {
          Logger.info('[QuickActionDebug] aiChat stored message metadata', {
            conversationId: body.conversationId,
            messageId: storedMessage.id,
            quickRepliesSource,
            quickRepliesCount: quickReplies?.length ?? 0,
          });
        }
      })());

      // Persist intake metadata off the stream-critical path.
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
      if (!responseClosed) {
        close();
      }
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
