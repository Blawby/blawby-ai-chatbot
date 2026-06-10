import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError } from '../types.js';
import type { Env } from '../types.js';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { ConversationService } from '../services/ConversationService.js';
import { getAttachedAuthContext } from '../middleware/compose.js';
import { requirePracticeMemberRole } from '../middleware/auth.js';
import { runPracticeAssistantTurn } from './practiceAssistant.js';
import { SessionAuditService } from '../services/SessionAuditService.js';
import { IntakeEventService, writeIntakeTurn } from '../services/IntakeEventService.js';
import type { IntakeEventRecordInput } from '../types/intakeEvent.js';
import {
  PartialIntakeSubmissionService,
  type PartialCollectedFields,
  type PartialSlimContactInput,
} from '../services/PartialIntakeSubmissionService.js';
import { createWorkersAiClient } from '../utils/workersAiClient.js';
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
  AI_RETRY_BACKOFF_MS,
  CONSULTATION_CTA_REGEX,
  LEGAL_INTENT_REGEX,
  HARD_ERROR_CODE,
  HARD_ERROR_MESSAGE,
  createSseResponse,
  consumeAiStream,
  normalizeKeys,
  createAiDebugError,
  isRecord,
  readAnyString,
  hasNonEmptyStringField,
  isDebugEnabled,
} from './aiChatShared.js';
import type { DebuggableAiError } from './aiChatShared.js';

import {
  INTAKE_TOOLS,
  buildIntakeTools,
  buildIntakeSystemPrompt,
  deriveCaseSavedAcknowledgment,
  mergeIntakeState,
  normalizeServicesForPrompt,
  shouldRequireDisclaimer,
  buildCompactPracticeContextForPrompt,
  executeIntakeTool,
  resolveNextField,
  computeCompletenessScore,
  COMPLETENESS_THRESHOLD_SHOW_CTA,
  type IntakeSubmissionGate,
  type ToolResult,
} from './aiChatIntake.js';

import {
  ONBOARDING_TOOL,
  buildOnboardingSystemPrompt,
  buildOnboardingProfileMetadata,
} from './aiChatOnboarding.js';
import type { ChatMessageAction } from '../../src/shared/types/conversation.js';
import { normalizeChatActions } from '../../src/shared/utils/chatActions.js';
import type { IntakeFieldDefinition } from '../../src/shared/types/intake.js';
import type { IntakeTemplate } from '../../src/shared/types/intake.js';
import { STANDARD_FIELD_DEFINITIONS } from '../../src/shared/constants/intakeTemplates.js';

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
  const consultationFee = readFiniteNumberField(details, ['consultation_fee']);
  const paymentLinkEnabled = readBooleanField(details, ['payment_link_enabled']);
  return paymentLinkEnabled === true && consultationFee !== null && consultationFee > 0;
};

const resolveTemplatePaymentConfig = (template: IntakeTemplate | null): {
  hasConfig: boolean;
  paymentRequiredBeforeSubmit: boolean;
  consultationFee: number | null;
} => {
  const hasConfig = Boolean(
    template &&
    (typeof template.paymentLinkEnabled === 'boolean' || typeof template.consultationFee === 'number')
  );
  const consultationFee = typeof template?.consultationFee === 'number' && Number.isFinite(template.consultationFee)
    ? template.consultationFee
    : null;
  return {
    hasConfig,
    paymentRequiredBeforeSubmit: hasConfig ? template?.paymentLinkEnabled === true && (consultationFee ?? 0) > 0 : false,
    consultationFee,
  };
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
    // Propagate the error so callers awaiting this function do not proceed
    // as-if persistence succeeded. This prevents emitting `done` when D1 writes fail.
    throw metadataError;
  }
};

/**
 * Extract the slim contact form payload for U7's partial-intake submission.
 * Returns null name/email when missing — the submission service handles the
 * "missing required fields" case by logging and skipping.
 *
 * Mirrors the field extraction in submitIntake.ts normalizeSlimContactDraft
 * without enforcing required-field presence (this runs on the AI failure path
 * where we want to send whatever we have).
 */
export function extractSlimContactForFailure(
  slimDraft: Record<string, unknown> | null,
): PartialSlimContactInput {
  const read = (key: string): string | null => {
    const value = slimDraft?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };
  return {
    name: read('name'),
    email: read('email'),
    phone: read('phone'),
    city: read('city'),
    state: read('state'),
  };
}

/**
 * Extract whatever case-detail fields the intake AI collected before failure.
 * Returns null if no usable fields were collected — keeps the payload tight
 * and avoids sending all-null fields to the backend.
 */
export function extractCollectedFieldsForFailure(
  state: Record<string, unknown> | null,
): PartialCollectedFields | null {
  if (!state) return null;
  const readString = (key: string): string | null => {
    const value = state[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };
  const readBool = (key: string): boolean | null => {
    const value = state[key];
    return typeof value === 'boolean' ? value : null;
  };
  const readNumber = (key: string): number | null => {
    const value = state[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const urgencyRaw = typeof state.urgency === 'string' ? state.urgency.trim().toLowerCase() : null;
  const urgency: PartialCollectedFields['urgency'] =
    urgencyRaw === 'routine' || urgencyRaw === 'time_sensitive' || urgencyRaw === 'emergency'
      ? urgencyRaw
      : null;

  const collected: PartialCollectedFields = {
    description: readString('description'),
    urgency,
    opposingParty: readString('opposingParty'),
    desiredOutcome: readString('desiredOutcome'),
    courtDate: readString('courtDate'),
    hasDocuments: readBool('hasDocuments'),
    income: readNumber('income'),
    householdSize: readNumber('householdSize'),
    practiceServiceUuid: readString('practiceServiceUuid'),
  };

  const hasValue = Object.values(collected).some(
    (value) => value !== null && value !== undefined,
  );
  return hasValue ? collected : null;
}

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

  // Auth attached by route-table withAuth({ required: true }) wrapper.
  const authContext = getAttachedAuthContext(request);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required');
  }
  Logger.info('AI chat timing: auth complete', {
    elapsedMs: Date.now() - requestStartedAt,
  });

  const body = await parseJsonBody(request) as {
    conversationId?: string;
    practiceSlug?: string;
    mode?: 'ASK_QUESTION' | 'REQUEST_CONSULTATION' | 'PRACTICE_ONBOARDING' | 'PRACTICE_ASSISTANT';
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

  // For anonymous widget sessions the slug is on the body, so slug-based
  // practice details can load concurrently with getConversationById.
  const practiceSlugFromBody = typeof body.practiceSlug === 'string' ? body.practiceSlug.trim() : '';
  if (authContext.isAnonymous === true && practiceSlugFromBody.length === 0) {
    throw HttpErrors.badRequest('practiceSlug is required for anonymous chat');
  }
  const anonymousPracticeDetailsPromise = authContext.isAnonymous === true
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

  if (effectiveMode === 'PRACTICE_ASSISTANT') {
    const auth = await requirePracticeMemberRole(request, env, practiceId, 'paralegal', { authContext });
    const lastUserMsg = [...body.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) throw HttpErrors.badRequest('No user message in conversation');
    if (lastUserMsg.content.length > 6000) {
      throw HttpErrors.badRequest('User message exceeds 6000 characters');
    }
    return runPracticeAssistantTurn({
      conversationId: body.conversationId,
      practiceId,
      practiceSlug,
      userMessage: lastUserMsg.content,
      userId: auth.user.id,
      auth,
      env,
      request,
      messages: body.messages.map((message) => ({ role: message.role, content: message.content })),
    });
  }

  const auditService = new SessionAuditService(env);
  const intakeEventService = new IntakeEventService(env);

  // The backend canonical practice identifier is details.id. Use the slug-based
  // prefetch as-is when present rather than forcing an extra fetch up front.
  const practiceDetailsPromise = anonymousPracticeDetailsPromise ?? fetchPracticeDetailsWithCache(
    env,
    request,
    practiceId,
    practiceSlug || undefined,
    {
      bypassCache: effectiveMode === 'PRACTICE_ONBOARDING',
      preferPracticeIdLookup: true,
    }
  );

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
    // If the details were loaded via anonymous slug, verify the org/practice id matches the conversation's practice_id
    if (
      anonymousPracticeDetailsPromise && details &&
      typeof conversation.practice_id === 'string'
    ) {
      const resolvedId = typeof details.id === 'string' ? details.id : null;
      if (resolvedId && resolvedId !== conversation.practice_id) {
        // Mismatch: fetch canonical details for practiceId
        const canonical = await fetchPracticeDetailsWithCache(
          env,
          request,
          conversation.practice_id,
          undefined,
          {
            bypassCache: effectiveMode === 'PRACTICE_ONBOARDING',
            preferPracticeIdLookup: true,
          }
        );
        details = canonical.details;
        isPublic = canonical.isPublic;
        Logger.info('AI chat: Discarded mismatched slug-derived practice details, loaded canonical by practice_id', {
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          resolvedId,
        });
      }
    }
    Logger.info('AI chat timing: practice details loaded', {
      conversationId: body.conversationId,
      practiceId,
      elapsedMs: Date.now() - requestStartedAt,
      anonymousSlugLookup: authContext.isAnonymous === true,
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
  const userName = readAnyString(slimDraft, ['name', 'displayName']);
  const intakeBriefActive = consultation
    ? consultation.status === 'collecting_case' || consultation.status === 'ready_to_submit'
    : conversationMetadata?.intakeAiBriefActive === true;

  // Canonical intake-mode signal — see U1 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
  // The legacy fallback predicate (effectiveMode + consultation + hasSlimContactDraft + intakeBriefActive)
  // is replaced by a single timestamp column on conversations. Existing intake conversations were backfilled
  // by the migration so this transition does not silently route them to general QA mode.
  const intakeModeSignals = await conversationService.getIntakeModeSignals(body.conversationId, practiceId);
  const intakeModeActivatedAt = intakeModeSignals.intake_mode_activated_at;
  const aiFailedAt = intakeModeSignals.ai_failed_at;
  const isIntakeMode = Boolean(
    isPublic &&
    intakeModeActivatedAt &&
    body.intakeSubmitted !== true
  );
  const isGeneralQaMode = !isIntakeMode && !isOnboardingMode;

  const lastUserMessageContent = body.messages?.[body.messages.length - 1]?.content ?? null;

  // U6: short-circuit when this conversation is already marked AI-failed.
  // The frontend (U8) renders a disabled composer + inline error in this state,
  // so a subsequent message hitting the handler is either a stale client or a
  // reload. Re-invoking the AI would just hit the same failure and risk a
  // duplicate partial-intake submission. Engineer escape hatch:
  // ConversationService.clearAiFailed exposed via /api/admin/intake-events
  // (U9 / U10) unbricks the conversation post-incident.
  if (isPublic && aiFailedAt) {
    Logger.info('intake.ai_failed.short_circuit', {
      conversationId: body.conversationId,
      practiceId,
      aiFailedAt,
    });
    return new Response(
      JSON.stringify({
        error: true,
        code: HARD_ERROR_CODE,
        message: HARD_ERROR_MESSAGE,
        aiFailedAt,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // U2: structured warning when intake mode resolves false on the public widget path.
  // Silent routing to QA mode is the bug class that prompted this initiative; making
  // it loud in logs ensures the next regression surfaces in days, not months.
  // U5: mirror the warning into the timeline (awaited + retry-once because
  // mode_unresolved turns ARE the timeline's primary purpose — silently dropping
  // them recreates the workflow this initiative exists to eliminate).
  if (isPublic && !isIntakeMode && !isOnboardingMode) {
    const modeResolutionSnapshot: Record<string, unknown> = {
      effectiveMode: effectiveMode ?? null,
      intakeModeActivatedAt: intakeModeActivatedAt ?? null,
      aiFailedAt: aiFailedAt ?? null,
      isPublic,
      hasSlimContactDraft,
      intakeBriefActive,
      consultationPresent: Boolean(consultation),
      consultationStatus: consultation?.status ?? null,
      intakeSubmitted: body.intakeSubmitted === true,
    };
    // Diagnostic log: metadata-only — the full user message is captured in the
    // intake_events timeline row written below for engineer-only inspection.
    // Don't ship raw user-entered legal-situation text to log aggregators.
    Logger.warn('intake.mode.unresolved', {
      conversationId: body.conversationId,
      practiceId,
      ...modeResolutionSnapshot,
      userMessageLength: lastUserMessageContent?.length ?? 0,
    });
    await writeIntakeTurn(
      intakeEventService,
      {
        conversationId: body.conversationId,
        practiceId,
        provenance: 'mode_unresolved',
        modeResolution: modeResolutionSnapshot,
        userMessage: lastUserMessageContent,
        failureReason: 'mode_unresolved_on_public_widget',
      },
      'await_with_retry',
    );
  }
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
    // Problem 1 diagnostic: log field values already present at turn start.
    // If city/state appear here before the user provided them, the state is
    // contaminated from a prior session via getOrCreateCurrentConversation.
    turnStartState: storedIntakeState ? {
      city: storedIntakeState.city ?? null,
      state: storedIntakeState.state ?? null,
      description: storedIntakeState.description ? '[present]' : null,
      enrichmentMode: storedIntakeState.enrichmentMode ?? null,
      stateSource: consultation?.case ? 'consultation.case' : 'intakeConversationState',
    } : null,
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
  const hasLegalIntent = Boolean(lastUserMessage && LEGAL_INTENT_REGEX.test(lastUserMessage.content));

  // ------------------------------------------------------------------
  // Short-circuit paths — instant replies that don't need streaming.
  // ------------------------------------------------------------------

  let shortCircuitReply: string | null = null;
  let shortCircuitOnboardingProfile: Record<string, unknown> | null = null;
  let isSafetyRailReply = false;

  // U3: hours-question and services-question regex shortcuts removed —
  // these silently bypassed the AI and masked failure modes (see issue #596).
  // Hours questions now route through the AI, which has practice contact details
  // in PRACTICE_CONTEXT and is instructed via the system prompt to recommend
  // contacting the practice when hours are not explicitly published. Services
  // questions are answered from PRACTICE_CONTEXT.services by the model.
  //
  // The legal-advice branch is KEPT as a SAFETY RAIL (not a fallback): improvised
  // legal advice is an unacceptable liability surface for "AI for legal practices".
  // The safety rail is provenance-tagged so it is loud in the event timeline (U5).
  if (isGeneralQaMode && hasLegalIntent) {
    shortCircuitReply = LEGAL_DISCLAIMER;
    isSafetyRailReply = true;
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

    // U5: record the short-circuit reply on the timeline. Legal-advice intent
    // gets the safety_rail provenance — distinguishing improvised legal advice
    // refusal from a normal AI intake turn.
    if (isSafetyRailReply) {
      await writeIntakeTurn(
        intakeEventService,
        {
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          provenance: 'safety_rail.legal_disclaimer',
          modeResolution: {
            effectiveMode: effectiveMode ?? null,
            intakeModeActivatedAt: intakeModeActivatedAt ?? null,
            aiFailedAt: aiFailedAt ?? null,
            isPublic,
            isIntakeMode,
            isOnboardingMode,
            isGeneralQaMode,
            hasLegalIntent,
          },
          userMessage: lastUserMessage?.content ?? null,
          modelResponse: {
            kind: 'safety_rail',
            reply: shortCircuitReply,
            messageId: storedMessage.id,
          },
        },
        'fire_and_forget',
      );
    }

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
  const aiClient = createWorkersAiClient(env);
  const model = DEFAULT_AI_MODEL;

  const servicesForPrompt = normalizeServicesForPrompt(details);
  const onboardingPromptProfile = isOnboardingMode
    ? buildOnboardingProfileMetadata(details, null)
    : null;

  // ---------------------------------------------------------------------------
  // Orchestration layer: resolve the active template and determine nextField
  // ---------------------------------------------------------------------------
  let templateFields: IntakeFieldDefinition[] = [];
  const storedTemplate = conversationMetadata?.intakeTemplate;
  try {
    if (
      storedTemplate &&
      typeof storedTemplate === 'object' &&
      !Array.isArray(storedTemplate) &&
      Array.isArray((storedTemplate as Record<string, unknown>).fields) &&
      ((storedTemplate as Record<string, unknown>).fields as unknown[]).length > 0
    ) {
      templateFields = (storedTemplate as Record<string, unknown>).fields as IntakeFieldDefinition[];
    }
  } catch {
    // Malformed metadata — use default
  }
  // Fall back to default template when none stored.
  // If we have template fields from conversation metadata, prefer a full
  // IntakeTemplate when possible; otherwise construct a minimal template
  // object that satisfies the `IntakeTemplate` shape so downstream callers
  // (e.g. `resolveNextField`) receive the correct type.
  let activeTemplate: IntakeTemplate;
  if (templateFields.length > 0) {
    if (storedTemplate && typeof (storedTemplate as Record<string, unknown>).slug === 'string' && typeof (storedTemplate as Record<string, unknown>).name === 'string') {
      activeTemplate = storedTemplate as IntakeTemplate;
    } else {
      activeTemplate = {
        slug: 'custom',
        name: 'Custom',
        isDefault: false,
        fields: templateFields,
      };
    }
  } else {
    // No template in session — use standard fields. This should only happen
    // if the bootstrap failed to attach a template; the real fix is upstream.
    activeTemplate = { slug: 'default', name: 'Default', is_default: true, fields: STANDARD_FIELD_DEFINITIONS };
  }

  const flatState = (storedIntakeState ?? {}) as Record<string, unknown>;

  // Resolve the single next field across ALL phases — required fields come first
  // (they appear earlier in the template fields array), then enrichment fields.
  // The AI is told exactly what to ask this turn; it never decides on its own.
  const nextField = resolveNextField(activeTemplate, flatState, 'required')
    ?? resolveNextField(activeTemplate, flatState, 'enrichment');

  // Compute the completeness score from the current state so the prompt can
  // tell the AI how close the intake is to complete.
  const completenessScore = computeCompletenessScore(activeTemplate, flatState);

  // Submission gate uses the orchestration layer when a template is active
  const templateRequiredFields = templateFields.length > 0
    ? templateFields.filter((f) => f.required || f.phase === 'required')
    : null;

  const templatePaymentConfig = resolveTemplatePaymentConfig(activeTemplate);

  const intakeSubmissionGate: IntakeSubmissionGate = {
    paymentRequiredBeforeSubmit:
      (consultation?.submission?.paymentRequired === true) ||
      (templatePaymentConfig.hasConfig
        ? templatePaymentConfig.paymentRequiredBeforeSubmit
        : resolvePracticeRequiresPaymentBeforeSubmission(details)),
    paymentCompleted: consultation?.submission?.paymentReceived === true,
    details,
    requiredFields: templateRequiredFields,
    activeTemplate,
    // Template fee takes precedence over practice-level details fee.
    templateConsultationFee: templatePaymentConfig.hasConfig ? templatePaymentConfig.consultationFee : null,
  };

  const requestPayload: Record<string, unknown> = {
    model,
    temperature: 0.2,
    stream: true,
    messages: [],
  };

  let systemPrompt: string;

  if (isIntakeMode) {
    // Adaptive prompt — the AI knows the next field and the completeness score
    systemPrompt = [
      buildIntakeSystemPrompt(
        servicesForPrompt,
        aiPromptContext,
        storedIntakeState,
        userName,
        nextField,
        completenessScore,
      ),
      `PRACTICE_CONTEXT: ${JSON.stringify(aiPromptContext)}`,
      body.additionalContext ? `SEARCH_CONTEXT: ${body.additionalContext}` : null,
    ].filter(Boolean).join('\n\n');

    requestPayload.messages = [
      { role: 'system', content: systemPrompt },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    requestPayload.tools = templateFields.length > 0
      ? buildIntakeTools(templateFields)
      : INTAKE_TOOLS;
    requestPayload.parallel_tool_calls = false;
    requestPayload.temperature = 0.5;
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

    /**
     * U6: end-of-conversation failure path for intake mode. ORDER MATTERS:
     *   1. submit partial intake to backend (preserves "no lead silently
     *      dropped" invariant — if we crash between submit and mark, the next
     *      user message re-enters the handler, sees ai_failed_at IS NULL,
     *      and the submit would already be on file via the prior turn's
     *      transient short-circuit. The invariant fails ONLY if mark runs
     *      before submit.)
     *   2. mark conversation as ai_failed so subsequent turns short-circuit
     *   3. record `ai_failure` turn on the timeline (awaited + retry-once)
     *   4. emit hard-error SSE event so the widget renders disabled composer (U8)
     *   5. close the SSE stream
     *
     * `options.persistPartial` is true when we hit CASE 5 (in-stream drop
     * after some tokens emitted) — the partial assistant message is persisted
     * with metadata.truncated so engineers can see what the user actually saw.
     */
    const handleAiFailure = async (
      failureReason: string,
      options?: { persistPartial?: boolean },
    ): Promise<void> => {
      if (responseClosed) {
        Logger.warn('intake.failure_path.skipped_response_closed', {
          conversationId: body.conversationId,
          failureReason,
        });
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      Logger.warn('intake.ai_failure.handling', {
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        failureReason,
        emittedAnyToken,
        accumulatedReplyLength: accumulatedReply.length,
      });

      const failureModeResolution: Record<string, unknown> = {
        effectiveMode: effectiveMode ?? null,
        intakeModeActivatedAt: intakeModeActivatedAt ?? null,
        aiFailedAt: aiFailedAt ?? null,
        isPublic,
        isIntakeMode,
        isOnboardingMode,
        isGeneralQaMode,
      };

      // Persist truncated assistant message if tokens were already emitted
      // (CASE 5). Not deleted, not silently abandoned — engineers can see
      // exactly what the user saw before the drop.
      if (options?.persistPartial && accumulatedReply.trim()) {
        try {
          await conversationService.sendSystemMessage({
            conversationId: body.conversationId,
            practiceId: conversation.practice_id,
            content: accumulatedReply,
            metadata: {
              source: 'ai',
              model,
              truncated: true,
              truncationReason: failureReason,
              ...(body.sourceBubbleId ? { sourceBubbleId: body.sourceBubbleId } : {}),
            },
            recipientUserId: authContext.user.id,
            skipPracticeValidation: shouldSkipPracticeValidation,
            request,
          });
        } catch (persistError) {
          Logger.warn('Failed to persist truncated assistant message on AI failure', {
            conversationId: body.conversationId,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          });
        }
      }

      // Step 1: partial-intake submission to backend (U7).
      try {
        const partialService = new PartialIntakeSubmissionService(env, request);
        const consultationFee = templatePaymentConfig.consultationFee
          ?? readFiniteNumberField(details, ['consultation_fee'])
          ?? 0;
        await partialService.submit({
          conversationId: body.conversationId,
          practiceSlug,
          amountMinor: consultationFee,
          slimContact: extractSlimContactForFailure(slimDraft),
          collectedFields: extractCollectedFieldsForFailure(storedIntakeState),
          failureContext: {
            reason: failureReason,
            mode_resolution_trace: failureModeResolution,
            timeline_ref: body.conversationId,
          },
        });
      } catch (submitError) {
        // PartialIntakeSubmissionService never throws (best-effort by design),
        // but defense-in-depth: a thrown exception here must NOT prevent the
        // mark + timeline + hard-error sequence below from running.
        Logger.warn('intake.partial_submit_unexpected_throw', {
          conversationId: body.conversationId,
          error: submitError instanceof Error ? submitError.message : String(submitError),
        });
      }

      // Step 2: mark conversation as AI-failed.
      try {
        await conversationService.markAiFailed(
          body.conversationId,
          conversation.practice_id,
          failureReason,
        );
      } catch (markError) {
        Logger.warn('Failed to mark conversation as AI-failed', {
          conversationId: body.conversationId,
          error: markError instanceof Error ? markError.message : String(markError),
        });
      }

      // Step 3: record ai_failure on the timeline (awaited + retry-once).
      await writeIntakeTurn(
        intakeEventService,
        {
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          provenance: 'ai_failure',
          modeResolution: failureModeResolution,
          userMessage: lastUserMessage?.content ?? null,
          modelResponse: accumulatedReply.trim()
            ? { reply: accumulatedReply, truncated: Boolean(options?.persistPartial) }
            : null,
          failureReason,
        },
        'await_with_retry',
      );

      // Step 4 + 5: emit hard-error and close.
      write({
        error: true,
        code: HARD_ERROR_CODE,
        message: HARD_ERROR_MESSAGE,
        failureReason,
      });
      close();
      responseClosed = true;
    };

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
      // streamWrite detects token emission in real time so emittedAnyToken
      // is accurate at every catch point (CASE 5 in-stream-drop detection
      // depends on this — the variable was previously only assigned post-stream).
      const streamWrite = (payload: Record<string, unknown>) => {
        if (typeof payload.token === 'string' && payload.token.length > 0) {
          if (conversationTTFTMs === null) {
            conversationTTFTMs = Date.now() - conversationRequestStartedAt;
          }
          emittedAnyToken = true;
        }
        write(payload);
      };

      // U6: AI request with bounded retry (1 retry on PRE-stream 5xx/network,
      // 0 retries on 4xx/timeout). Once any token has emitted, stream errors
      // are no longer retryable because the user has already seen partial content.
      let aiResponse: Response | null = null;
      let preStreamFailureReason: string | null = null;
      const maxAiAttempts = 2;
      // U11 affordance: when INTAKE_AI_FORCE_FAILURE=true AND not running in
      // production, force the AI call to short-circuit as a 5xx-like upstream
      // failure on every attempt so E2E tests can exercise the failure path
      // (U6 / U7 / U8) without flaking on real AI behavior. NODE_ENV gating
      // ensures a config-drift accident in prod is a silent no-op rather than
      // a permanent intake outage.
      const forceFailureForE2E =
        env.NODE_ENV !== 'production' &&
        String(env.INTAKE_AI_FORCE_FAILURE ?? '').toLowerCase() === 'true';

      for (let attempt = 0; attempt < maxAiAttempts; attempt++) {
        const controller = new AbortController();
        timeoutId = setTimeout(() => {
          controller.abort();
        }, AI_TIMEOUT_MS);

        try {
          const candidate = forceFailureForE2E
            ? new Response('forced failure for E2E', { status: 503 })
            : await aiClient.requestChatCompletions(
                requestPayload,
                controller.signal,
                { headers: { 'x-session-affinity': body.conversationId } }
              );

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          Logger.info('AI chat timing: conversation upstream headers received', {
            conversationId: body.conversationId,
            elapsedMs: Date.now() - conversationRequestStartedAt,
            totalElapsedMs: Date.now() - requestStartedAt,
            status: candidate.status,
            attempt: attempt + 1,
          });

          if (candidate.ok) {
            aiResponse = candidate;
            break;
          }

          const errorText = await candidate.text().catch(() => '');

          // 4xx: logic error — fail immediately, no retry.
          if (candidate.status >= 400 && candidate.status < 500) {
            Logger.warn('AI upstream returned 4xx; no retry', {
              conversationId: body.conversationId,
              status: candidate.status,
              body: errorText,
              model,
            });
            preStreamFailureReason = `upstream_logic_${candidate.status}`;
            break;
          }

          // 5xx: transient — retry once if we have attempts left.
          if (attempt < maxAiAttempts - 1) {
            Logger.warn('AI upstream returned 5xx; retrying once', {
              conversationId: body.conversationId,
              status: candidate.status,
              body: errorText,
              model,
            });
            await new Promise((resolve) => setTimeout(resolve, AI_RETRY_BACKOFF_MS));
            continue;
          }

          Logger.warn('AI upstream 5xx retries exhausted', {
            conversationId: body.conversationId,
            status: candidate.status,
            body: errorText,
            model,
          });
          preStreamFailureReason = `upstream_transient_exhausted_${candidate.status}`;
          break;
        } catch (err) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          // AbortError fires on AI_TIMEOUT_MS timeout. Retrying a slow upstream
          // typically makes things worse — treat as immediate failure.
          if (err instanceof Error && err.name === 'AbortError') {
            Logger.warn('AI request timed out; no retry', {
              conversationId: body.conversationId,
              timeoutMs: AI_TIMEOUT_MS,
            });
            preStreamFailureReason = 'upstream_timeout';
            break;
          }

          if (attempt < maxAiAttempts - 1) {
            Logger.warn('AI upstream network error; retrying once', {
              conversationId: body.conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
            await new Promise((resolve) => setTimeout(resolve, AI_RETRY_BACKOFF_MS));
            continue;
          }

          Logger.warn('AI upstream network retries exhausted', {
            conversationId: body.conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
          preStreamFailureReason = 'upstream_network_exhausted';
          break;
        }
      }

      if (preStreamFailureReason || !aiResponse) {
        if (isIntakeMode) {
          await handleAiFailure(preStreamFailureReason ?? 'upstream_unknown');
          return;
        }
        // Non-intake (e.g. onboarding) keeps the existing toast-error path so
        // a brief outage doesn't permanently brick the practice onboarding flow.
        write({
          error: true,
          code: 'ai_request_failed',
          message: 'AI request failed',
        });
        return;
      }

      if (!aiResponse.body) {
        if (isIntakeMode) {
          await handleAiFailure('upstream_missing_body');
          return;
        }
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
      let lastQuestionResult: ToolResult | null = null;
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
          toolCall.name === 'submit_intake' ||
          toolCall.name === 'ask_user_question'
        )) {
          const cleanArgs = unwrapToolCallJsonArgs(toolCall.arguments);
          const result = executeIntakeTool(
            toolCall.name,
            cleanArgs,
            mergeIntakeState(storedIntakeState, Object.keys(accumulatedIntakePatch).length > 0 ? accumulatedIntakePatch : null),
            intakeSubmissionGate,
          );
          if (result.question) {
            lastQuestionResult = result;
          } else {
            lastToolResult = result;
          }

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

      const finalToolResult = lastQuestionResult ?? lastToolResult;

      if (!accumulatedReply.trim() && !finalToolResult && !onboardingFields) {
        if (isIntakeMode) {
          // CASE 3: AI returned empty content AND no tool calls. Logic error,
          // not transient. Route through the failure path so the lead is
          // captured + the conversation is marked + the user sees the hard error.
          await handleAiFailure('empty_response');
          return;
        }
        throw createAiDebugError(
          isOnboardingMode
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
      let intakeQuestion: { text: string; options: Array<{ label: string; value: string }> } | null = null;
      let onboardingProfile: Record<string, unknown> | null = null;
      let triggerEditModal: string | null = null;

      if (isIntakeMode && finalToolResult?.actions && finalToolResult.actions.length > 0) {
        actions = finalToolResult.actions;
      }
      if (isIntakeMode && lastQuestionResult?.question) {
        intakeQuestion = lastQuestionResult.question;
        if (lastQuestionResult.actions && lastQuestionResult.actions.length > 0) {
          actions = lastQuestionResult.actions;
        }
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
      
      // Detect tool-only behavior and normalize successful intake tool turns.
      const wasToolOnly = accumulatedReply.trim().length === 0 && streamResult.toolCalls.length > 0;
      const shouldUseToolReply = isIntakeMode && finalToolResult?.success === true;
      const normalizationReasons: string[] = [];
      let syntheticReply = '';

      if (wasToolOnly) {
        normalizationReasons.push('tool_only_completion');
      }

      if (shouldUseToolReply) {
        if (!wasToolOnly && accumulatedReply.trim()) {
          normalizationReasons.push('tool_completion_replaced_model_text');
        }
        if (isIntakeMode && lastQuestionResult?.success && typeof lastQuestionResult.message === 'string' && lastQuestionResult.message.trim()) {
          syntheticReply = lastQuestionResult.message.trim();
        } else if (isIntakeMode && finalToolResult?.success && patchToMerge) {
          const consultationFee = templatePaymentConfig.hasConfig
            ? templatePaymentConfig.consultationFee
            : readFiniteNumberField(details, ['consultation_fee']);
          // Recompute nextField and score from POST-merge state so the synthetic
          // reply doesn't re-ask the field that save_case_details just answered.
          const mergedState = mergedIntakeState as Record<string, unknown> | null;
          const nextFieldAfterPatch = mergedState
            ? (resolveNextField(activeTemplate, mergedState, 'required') ?? resolveNextField(activeTemplate, mergedState, 'enrichment'))
            : null;
          const scoreAfterPatch = mergedState
            ? computeCompletenessScore(activeTemplate, mergedState)
            : 0;
          syntheticReply = deriveCaseSavedAcknowledgment(
            finalToolResult,
            intakeSubmissionGate,
            mergedIntakeState,
            servicesForPrompt,
            consultationFee,
            userName,
            nextFieldAfterPatch,
            scoreAfterPatch,
          );
          if (!syntheticReply && typeof finalToolResult.message === 'string' && finalToolResult.message.trim()) {
            syntheticReply = finalToolResult.message.trim();
          }
        } else if (typeof finalToolResult.message === 'string' && finalToolResult.message.trim()) {
          syntheticReply = finalToolResult.message.trim();
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
      let persistedMessageId: string | null = null;
      let messagePersisted = false;
      
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
            ...(intakeQuestion ? { question: intakeQuestion } : {}),
            ...(triggerEditModal ? { triggerEditModal } : {}),
            ...(shouldPromptConsultation
              ? { modeSelector: { showAskQuestion: false, showRequestConsultation: true, source: 'ai' } }
              : {}),
            ...(wasToolOnly || normalizationReasons.length > 0 ? { wasToolOnly, normalizationReasons } : {}),
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
          kind: syntheticReply ? 'synthetic' : 'original',
          wasToolOnly,
        });

        if (debugEnabled) {
          write({ debug: { persistedId: storedMessage.id } });
        }
        
        persistedMessageId = storedMessage.id;
        messagePersisted = true;
      } else {
        Logger.info('ai.message.skipped', {
          requestId,
          conversationId: body.conversationId,
          reason: 'empty_reply',
          wasToolOnly,
        });
      }

      // Persist intake state to D1 BEFORE emitting done.
      // The post-stream path creates a race: the user's next message can arrive
      // before the D1 write completes, causing the next turn to read stale state
      // (e.g. description missing → AI re-asks). Streaming text is already
      // complete at this point so this adds no perceived latency.
      if (isIntakeMode && mergedIntakeState) {
        await persistMergedIntakeState(conversationService, {
          conversationId: body.conversationId,
          practiceId: conversation.practice_id,
          consultationStatus: consultation?.status,
          mergedIntakeState,
        });
      }

      // Emit done — D1 is now consistent before the client acts on fields
      write({
        done: true,
        reply: finalReply,
        intakeFields: mergedIntakeState ?? null,
        onboardingFields: onboardingFields ?? null,
        onboardingProfile: onboardingProfile ?? null,
        actions: actions ?? null,
        question: intakeQuestion ?? null,
        wasToolOnly,
        messagePersisted,
        persistedMessageId,
      });

      close();
      responseClosed = true;

      const postStreamTasks: Promise<unknown>[] = [];

      postStreamTasks.push(auditService.createEvent({
        conversationId: body.conversationId,
        practiceId: conversation.practice_id,
        eventType: 'ai_message_received',
        actorType: 'system',
        payload: { conversationId: body.conversationId }
      }));

      // U5: record this AI turn on the intake timeline. Fire-and-forget via
      // postStreamTasks so the SSE close isn't delayed. Provenance distinguishes
      // tool-call turns (ai_intake), text-only turns (ai_intake_no_tool_call),
      // and submission turns (submit_intake — the terminal turn of the intake).
      if (isIntakeMode) {
        const submittedIntake = streamResult.toolCalls.some((call) => call.name === 'submit_intake');
        const turnProvenance: IntakeEventRecordInput['provenance'] = submittedIntake
          ? 'submit_intake'
          : streamResult.toolCalls.length > 0
            ? 'ai_intake'
            : 'ai_intake_no_tool_call';

        const turnModeResolution: Record<string, unknown> = {
          effectiveMode: effectiveMode ?? null,
          intakeModeActivatedAt: intakeModeActivatedAt ?? null,
          aiFailedAt: aiFailedAt ?? null,
          isPublic,
          isIntakeMode,
          isOnboardingMode,
          isGeneralQaMode,
        };

        const turnModelRequest: Record<string, unknown> = {
          model,
          temperature: requestPayload.temperature ?? null,
          systemPromptLength: systemPrompt.length,
          toolNames: Array.isArray(requestPayload.tools)
            ? requestPayload.tools
                .map((tool) => (tool as { function?: { name?: string } }).function?.name ?? null)
                .filter((name): name is string => Boolean(name))
            : [],
          messageCount: body.messages.length,
        };

        const turnModelResponse: Record<string, unknown> = {
          reply: finalReply,
          accumulatedReply,
          syntheticReply,
          emittedAnyToken,
          streamStalled: streamResult.streamStalled,
          replyLength: streamResult.reply.length,
          conversationTTFTMs,
          conversationTotalResponseMs,
          aigStep,
        };

        const turnToolCalls = streamResult.toolCalls.length > 0
          ? streamResult.toolCalls.map((call) => ({
              name: call.name,
              argLength: call.arguments.length,
            }))
          : null;

        const turnToolResults = (lastToolResult || lastQuestionResult)
          ? [lastToolResult, lastQuestionResult].filter((value): value is ToolResult => Boolean(value))
          : null;

        postStreamTasks.push(writeIntakeTurn(
          intakeEventService,
          {
            conversationId: body.conversationId,
            practiceId: conversation.practice_id,
            provenance: turnProvenance,
            modeResolution: turnModeResolution,
            userMessage: lastUserMessage?.content ?? null,
            modelRequest: turnModelRequest,
            modelResponse: turnModelResponse,
            toolCalls: turnToolCalls,
            toolResults: turnToolResults,
          },
          'fire_and_forget',
        ));
      }

      schedulePostStreamTasks(ctx, body.conversationId, postStreamTasks);

    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // U6: any exception that reaches here for an intake conversation routes
      // through the failure path. Covers CASE 4 (tool execution exception)
      // and CASE 5 (in-stream drop after emit) — both are logic-level failures
      // for the intake flow that must not silently lose the lead.
      if (isIntakeMode && !responseClosed) {
        const typedError = error as DebuggableAiError;
        const reason = emittedAnyToken
          ? 'in_stream_drop_after_emit'
          : typedError?.code === 'ai_empty_reply'
            ? 'empty_response'
            : 'tool_or_stream_exception';
        Logger.warn('Streaming AI handler error — routing to intake failure path', {
          conversationId: body.conversationId,
          error: error instanceof Error ? error.message : String(error),
          code: typedError?.code ?? null,
          emittedAnyToken,
          reason,
        });
        await handleAiFailure(reason, { persistPartial: emittedAnyToken });
        return;
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
