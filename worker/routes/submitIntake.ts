/**
 * POST /api/conversations/:id/submit-intake
 *
 * Submission bridge: reads accumulated intake state from D1 conversation
 * metadata, maps it to the backend client-intakes create payload, calls the
 * remote API, persists the returned intake_uuid back into user_info, and
 * returns the payment routing info to the frontend.
 *
 * Place this file at: worker/routes/submitIntake.ts
 */

import { HttpErrors } from '../errorHandler.js';
import { ConversationService } from '../services/ConversationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { optionalAuth, checkPracticeMembership } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import { isIntakeReadyForSubmission, resolveConsultationState } from '../../src/shared/utils/consultationState';
import { fetchPracticeDetailsWithCache } from '../utils/practiceDetailsCache.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface SlimContactDraft {
  name: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  opposingParty?: string;
  description?: string;
}

interface IntakeConversationState {
  description?: string | null;
  urgency?: 'routine' | 'time_sensitive' | 'emergency' | null;
  opposingParty?: string | null;
  city?: string | null;
  state?: string | null;
  desiredOutcome?: string | null;
  courtDate?: string | null;
  hasDocuments?: boolean | null;
  income?: string | null;
  householdSize?: number | null;
  practiceArea?: string | null;
}

interface ConversationUserInfo {
  practiceSlug?: string;
  intakeSlimContactDraft?: SlimContactDraft | null;
  intakeConversationState?: IntakeConversationState | null;
  intakeUuid?: string | null;
  [key: string]: unknown;
}

type IntakeSettings = NonNullable<Awaited<ReturnType<typeof RemoteApiService.getPracticeClientIntakeSettings>>>;

interface BackendIntakeCreatePayload {
  slug: string;
  amount: number;
  name: string;
  email: string;
  user_id?: string;
  phone?: string;
  conversation_id: string;
  description?: string;
  urgency?: string;
  opposing_party?: string;
  desired_outcome?: string;
  court_date?: string;
  case_strength?: number;
  has_documents?: boolean;
  // income is intentionally omitted — free-text string incompatible with backend number type
  household_size?: number;
  practice_area?: string;
  city?: string;
  state?: string;
  /** Plain-text digest of the intake conversation; max 4000 chars. Used by backend to bootstrap proposal_data. */
  transcript_summary?: string;
}

interface BackendIntakeCreateResponse {
  success: boolean;
  data?: {
    uuid: string;
    status: string;
    payment_link_url: string | null;
    organization?: {
      name?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  };
  error?: string;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const normalizeSlimContactDraft = (value: unknown): SlimContactDraft | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  const email = typeof draft.email === 'string' ? draft.email.trim() : '';
  if (!name || !email) return null;
  return {
    name,
    email,
    phone: typeof draft.phone === 'string' ? draft.phone.trim() : undefined,
    city: typeof draft.city === 'string' ? draft.city.trim() : undefined,
    state: typeof draft.state === 'string' ? draft.state.trim() : undefined,
    opposingParty: typeof draft.opposingParty === 'string' ? draft.opposingParty.trim() : undefined,
    description: typeof draft.description === 'string' ? draft.description.trim() : undefined,
  };
};

const sanitizeMergedIntakeState = (value: unknown): IntakeConversationState | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const parseStr = (val: unknown) => typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;

  const urgencyRaw = typeof raw.urgency === 'string' ? raw.urgency.trim().toLowerCase() : null;
  const urgency = urgencyRaw === 'routine' || urgencyRaw === 'time_sensitive' || urgencyRaw === 'emergency' 
    ? urgencyRaw 
    : null;

  const state: IntakeConversationState = {
    description: parseStr(raw.description),
    urgency,
    opposingParty: parseStr(raw.opposingParty),
    city: parseStr(raw.city),
    state: parseStr(raw.state),
    desiredOutcome: parseStr(raw.desiredOutcome),
    courtDate: parseStr(raw.courtDate),
    hasDocuments: typeof raw.hasDocuments === 'boolean' ? raw.hasDocuments : null,
    income: parseStr(raw.income),
    householdSize: typeof raw.householdSize === 'number' ? raw.householdSize : null,
    practiceArea: parseStr(raw.practiceArea),
  };

  for (const key of Object.keys(state) as Array<keyof IntakeConversationState>) {
    if (state[key] === null || state[key] === undefined) {
      delete state[key];
    }
  }

  return Object.keys(state).length > 0 ? state : null;
};

const readStringField = (record: Record<string, unknown> | null | undefined, keys: string[]): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const readFiniteNumberField = (record: Record<string, unknown> | null | undefined, keys: string[]): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

// ------------------------------------------------------------------
// Transcript summary builder
// ------------------------------------------------------------------

const TRANSCRIPT_MAX_CHARS = 4000;
const TRANSCRIPT_MESSAGE_LIMIT = 30;

/**
 * Assembles a plain-text conversation transcript from D1.
 * Pulls the last TRANSCRIPT_MESSAGE_LIMIT user/assistant messages (excludes system).
 * Returns null silently if the query fails — submission must not be blocked.
 */
async function buildTranscriptSummary(
  env: Env,
  conversationId: string,
  practiceId: string,
): Promise<string | null> {
  try {
    const records = await env.DB.prepare(`
      SELECT role, content
      FROM chat_messages
      WHERE conversation_id = ?
        AND practice_id = ?
        AND role IN ('user', 'assistant')
        AND TRIM(COALESCE(content, '')) <> ''
      ORDER BY seq DESC
      LIMIT ?
    `).bind(conversationId, practiceId, TRANSCRIPT_MESSAGE_LIMIT).all<{
      role: string;
      content: string;
    }>();

    if (!records.results || records.results.length === 0) return null;

    // Reverse so oldest is first (DESC pulls newest, we want chronological)
    const lines = records.results.reverse().map((row) => {
      const label = row.role === 'user' ? 'User' : 'Assistant';
      // Trim each message to prevent one long message dominating the budget
      const content = row.content.trim().slice(0, 800);
      return `${label}: ${content}`;
    });

    const full = lines.join('\n');
    // Hard cap to stay under backend field limits
    return full.length > TRANSCRIPT_MAX_CHARS ? full.slice(-TRANSCRIPT_MAX_CHARS) : full;
  } catch (error) {
    Logger.error('[submitIntake] Failed to build transcript_summary', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const getResolvedAmountMinor = ({
  intakeSettings,
  fallbackConsultationFeeMinor,
}: {
  intakeSettings: IntakeSettings | null;
  fallbackConsultationFeeMinor: number | null;
}): number => {
  const consultationFee = typeof intakeSettings?.consultationFee === 'number' && Number.isFinite(intakeSettings.consultationFee)
    ? intakeSettings.consultationFee
    : null;
  if (consultationFee !== null && consultationFee > 0) {
    return consultationFee;
  }
  if (typeof fallbackConsultationFeeMinor === 'number' && fallbackConsultationFeeMinor > 0) {
    return fallbackConsultationFeeMinor;
  }

  return 0;
};

const isCaseInfoComplete = (state: IntakeConversationState | null | undefined, draft?: SlimContactDraft | null): boolean => {
  const readTrimmedString = (value: unknown): string | null => (
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  );
  const readinessState = {
    description: readTrimmedString(state?.description) || readTrimmedString(draft?.description),
    city: readTrimmedString(state?.city) || readTrimmedString(draft?.city),
    state: readTrimmedString(state?.state) || readTrimmedString(draft?.state),
    opposingParty: readTrimmedString(state?.opposingParty) || readTrimmedString(draft?.opposingParty),
  };
  return isIntakeReadyForSubmission(readinessState);
};

const buildIntakePayload = (
  conversationId: string,
  slug: string,
  draft: SlimContactDraft,
  intake: IntakeConversationState | null | undefined,
  options?: {
    amountMinor?: number;
    userId?: string;
  }
): BackendIntakeCreatePayload => {
  const normalizeAmount = (value: number | undefined): number => {
    const min = 0;
    const max = 99_999_999;
    if (typeof value !== 'number' || !Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
  };
  const isIsoDateString = (value: string): boolean => {
    // Accept ISO 8601 date-only (YYYY-MM-DD) and datetime strings
    // (YYYY-MM-DDTHH:mm:ss[.sss][Z|±HH:mm]) — reject plain-text like "next Tuesday".
    // The backend validates the full datetime; we only gate on structural shape here
    // so we don't pass clearly garbage strings.
    return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(value.trim());
  };
  const payload: BackendIntakeCreatePayload = {
    slug,
    amount: normalizeAmount(options?.amountMinor),
    name: draft.name,
    email: draft.email,
    conversation_id: conversationId,
  };

  if (options?.userId && options.userId.trim().length > 0) {
    payload.user_id = options.userId.trim();
  }

  if (draft.phone) payload.phone = draft.phone;
  const city = intake?.city?.trim() || draft.city;
  const state = intake?.state?.trim() || draft.state;
  if (city) payload.city = city;
  if (state) payload.state = state;

  // Merge AI-enriched fields — intake fields take precedence over draft
  const description = intake?.description?.trim() || draft.description?.trim();
  if (description) payload.description = description;

  const opposingParty = intake?.opposingParty?.trim() || draft.opposingParty?.trim();
  if (opposingParty) payload.opposing_party = opposingParty;

  if (intake?.urgency) payload.urgency = intake.urgency;
  if (intake?.desiredOutcome) payload.desired_outcome = intake.desiredOutcome;
  if (intake?.courtDate && isIsoDateString(intake.courtDate)) payload.court_date = intake.courtDate;
  if (typeof intake?.hasDocuments === 'boolean') payload.has_documents = intake.hasDocuments;
  // income is intentionally omitted — the backend expects a number but extraction returns free-text;
  // if sliding-scale eligibility is needed, handle it in a separate dedicated flow.
  if (typeof intake?.householdSize === 'number') payload.household_size = intake.householdSize;
  if (intake?.practiceArea) payload.practice_area = intake.practiceArea;

  return payload;
};

// ------------------------------------------------------------------
// Handler
// ------------------------------------------------------------------

export async function handleSubmitIntake(
  request: Request,
  env: Env,
  conversationId: string,
  /** Pre-resolved auth context from the outer conversations handler; avoids a redundant remote auth round-trip. */
  callerAuthContext?: AuthContext
): Promise<Response> {
  // Auth — accept a pre-resolved context from the caller, or resolve it now.
  const authContext = callerAuthContext ?? await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required');
  }
  const userId = authContext.user.id;
  Logger.info('[submitIntake] Request received', {
    conversationId,
    authUserId: userId,
    isAnonymous: authContext.isAnonymous === true,
    previousAnonUserId: authContext.previousAnonUserId ?? null,
  });

  // Practice context: preserve the public-widget practiceId during anon -> auth handoff.
  const requestWithContext = await withPracticeContext(request, env, {
    requirePractice: true,
    authContext,
    allowAuthenticatedUrlPracticeId: true,
  });
  const practiceId = getPracticeId(requestWithContext);
  Logger.info('[submitIntake] Practice context resolved', {
    conversationId,
    practiceId,
    authUserId: userId,
  });
  const membership = await checkPracticeMembership(request, env, practiceId, { authContext });
  Logger.info('[submitIntake] Membership check evaluated', {
    conversationId,
    practiceId,
    authUserId: userId,
    membershipInput: {
      practiceId,
      userId,
      hasAuthCookie: Boolean(authContext.cookie?.trim()),
      activeOrganizationId: authContext.activeOrganizationId ?? null,
    },
    membershipResult: {
      isMember: membership.isMember,
      memberRole: membership.memberRole ?? null,
    },
  });
  if (membership.isMember) {
    Logger.warn('[submitIntake] Rejecting submit-intake because user is classified as practice member', {
      conversationId,
      practiceId,
      authUserId: userId,
      reason: 'practice_member_blocked',
      memberRole: membership.memberRole ?? null,
    });
    throw HttpErrors.forbidden('Practice members cannot submit visitor intake');
  }

  const conversationService = new ConversationService(env);

  // Validate participant access — include previousAnonUserId grace window so that
  // submit-intake calls that race against PATCH /link don't 403.
  const prevAnonId = authContext.previousAnonUserId ?? null;
  await conversationService.validateParticipantAccess(conversationId, practiceId, userId, { previousAnonUserId: prevAnonId });

  // Load conversation with row lock to prevent concurrent duplicate submissions
  const conversation = await conversationService.getConversation(conversationId, practiceId, { repair: true });
  const userInfo = (conversation.user_info ?? {}) as ConversationUserInfo;
  const consultation = resolveConsultationState(userInfo);
  const linkedContactId = readStringField(userInfo as Record<string, unknown>, [
    'linkedContactId',
    'linked_contact_id',
    'contactId',
    'contact_id',
    'clientId',
    'client_id',
  ]);
  Logger.info('[submitIntake] Conversation loaded for submission', {
    conversationId,
    practiceId,
    authUserId: userId,
    linkedContactId: linkedContactId ?? null,
    consultationStatus: consultation?.status ?? null,
    hasConsultationContact: Boolean(consultation?.contact),
    hasConsultationCase: Boolean(consultation?.case),
    hasExistingIntakeUuid: Boolean(consultation?.submission.intakeUuid || userInfo.intakeUuid),
  });

  // Early exit if already submitted (best-effort check before lock)
  if (consultation?.submission.intakeUuid || userInfo.intakeUuid) {
    const existingIntakeUuid = consultation?.submission.intakeUuid ?? userInfo.intakeUuid ?? null;
    Logger.warn('[submitIntake] Intake already submitted, returning existing UUID', {
      conversationId,
      practiceId,
      existingIntakeUuid,
    });
    // Return the existing intake UUID idempotently
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          intake_uuid: existingIntakeUuid,
          status: 'existing',
          payment_link_url: null,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Resolve slug — stored during handleSlimFormContinue
  const slug = typeof userInfo.practiceSlug === 'string' ? userInfo.practiceSlug.trim() : '';
  if (!slug) {
    Logger.warn('[submitIntake] Rejecting submit-intake due to missing practice slug', {
      conversationId,
      practiceId,
      authUserId: userId,
      reason: 'missing_practice_slug',
    });
    throw HttpErrors.badRequest('Practice slug not found on conversation — cannot submit intake');
  }

  // Validate draft
  const draft = normalizeSlimContactDraft(consultation?.contact ?? userInfo.intakeSlimContactDraft);
  if (!draft) {
    Logger.warn('[submitIntake] Rejecting submit-intake due to incomplete contact draft', {
      conversationId,
      practiceId,
      authUserId: userId,
      reason: 'missing_contact_details',
    });
    throw HttpErrors.badRequest('Contact details are incomplete — name and email are required');
  }

  let clientMergedIntakeState: IntakeConversationState | null = null;
  if (request.body) {
    try {
      const clonedRequest = request.clone();
      const bodyText = await clonedRequest.text();
      if (bodyText) {
        const body = JSON.parse(bodyText);
        if (body && typeof body === 'object' && 'mergedIntakeState' in body) {
          clientMergedIntakeState = sanitizeMergedIntakeState(body.mergedIntakeState);
        }
      }
    } catch (_e) {
      // Ignore parse errors, fallback to DB only
    }
  }

  let intake = (consultation?.case as IntakeConversationState | null | undefined)
    ?? userInfo.intakeConversationState as IntakeConversationState | null | undefined;

  if (clientMergedIntakeState) {
    intake = { ...(intake ?? {}), ...clientMergedIntakeState };
    Logger.info('[submitIntake] Merged client-provided mergedIntakeState into case to avoid stale reads', {
      conversationId,
      practiceId,
      clientKeys: Object.keys(clientMergedIntakeState),
    });
  }

  const intakeSettings = await RemoteApiService.getPracticeClientIntakeSettings(env, slug, request);
  const practiceDetails = await fetchPracticeDetailsWithCache(env, request, practiceId, slug);
  const fallbackConsultationFeeMinor = readFiniteNumberField(practiceDetails.details, [
    'consultationFee',
    'consultation_fee',
  ]);
  const settingsPaymentLinkEnabled = intakeSettings?.paymentLinkEnabled === true;
  let resolvedAmountMinor = getResolvedAmountMinor({
    intakeSettings,
    fallbackConsultationFeeMinor,
  });
  const paymentRequiredBeforeSubmit = settingsPaymentLinkEnabled || resolvedAmountMinor > 0;
  const paymentReceived = consultation?.submission?.paymentReceived === true;
  const generatePaymentLinkOnly = new URL(request.url).searchParams.get('generatePaymentLinkOnly') === 'true';
  const caseInfoComplete = isCaseInfoComplete(intake, draft);
  const submitEligibility = caseInfoComplete && (generatePaymentLinkOnly || !paymentRequiredBeforeSubmit || paymentReceived);
  Logger.info('[submitIntake] Submit eligibility evaluated', {
    conversationId,
    practiceId,
    practiceSlug: slug,
    authUserId: userId,
    linkedContactId: linkedContactId ?? null,
    caseInfoComplete,
    paymentRequiredBeforeSubmit,
    paymentReceived,
    submitEligibility,
    intakeStateKeys: intake ? Object.keys(intake) : [],
  });
  if (!submitEligibility) {
    Logger.warn('[submitIntake] Submission blocked because intake is not yet eligible', {
      conversationId,
      practiceId,
      practiceSlug: slug,
      authUserId: userId,
      linkedContactId: linkedContactId ?? null,
      caseInfoComplete,
      paymentRequiredBeforeSubmit,
      paymentReceived,
    });
    throw HttpErrors.badRequest(
      'Intake is not yet ready to submit. Please complete the missing details or payment step first.'
    );
  }

  // Build backend payload using the canonical consultation fee resolved above.
  const intakePayload = buildIntakePayload(conversationId, slug, draft, intake, {
    amountMinor: resolvedAmountMinor,
    userId,
  });

  Logger.info('[submitIntake] Calling backend intake create', {
    conversationId,
    practiceId,
    slug,
    payloadKeys: Object.keys(intakePayload),
    hasIntakeFields: Boolean(intake),
    amountMinor: intakePayload.amount,
    hasCookie: Boolean(request.headers.get('Cookie')?.trim()),
    hasAuthorization: Boolean(request.headers.get('Authorization')?.trim()),
  });

  // Assemble transcript_summary from D1 — best-effort, does not block submission
  const transcriptSummary = await buildTranscriptSummary(env, conversationId, practiceId);
  if (transcriptSummary) {
    intakePayload.transcript_summary = transcriptSummary;
    Logger.info('[submitIntake] transcript_summary assembled', {
      conversationId,
      chars: transcriptSummary.length,
    });
  }

  // Call backend API via existing RemoteApiService pattern
  let backendResponse: Response;
  try {
    backendResponse = await RemoteApiService.createIntake(
      env,
      intakePayload as unknown as Record<string, unknown>,
      request
    );
  } catch (error) {
    const httpStatus = typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : null;
    const isRemoteBadRequest = httpStatus === 400;
    Logger.error('[submitIntake] Backend intake create request failed before response handling', {
      conversationId,
      practiceId,
      practiceSlug: slug,
      authUserId: userId,
      linkedContactId: linkedContactId ?? null,
      slug,
      error: error instanceof Error ? error.message : String(error),
      status: httpStatus,
      returnPathReason: isRemoteBadRequest ? 'remote_create_intake_400' : 'remote_create_intake_error',
    });
    throw error;
  }
  const backendPayload = await backendResponse.json() as BackendIntakeCreateResponse;

  if (!backendPayload?.success || !backendPayload.data?.uuid) {
    const errorDetails = backendPayload?.error ?? 'No uuid returned';
    Logger.error('[submitIntake] Backend intake create failed', {
      conversationId,
      practiceId,
      error: errorDetails,
    });
    throw HttpErrors.internalServerError(`Backend intake creation failed: ${errorDetails}`);
  }

  const { uuid: intakeUuid, status, payment_link_url, organization } = backendPayload.data;

  // Persist intake_uuid back into D1 conversation metadata
  try {
    await conversationService.mergeConsultationMetadata(
      conversationId,
      practiceId,
      {
        status: 'submitted',
        submission: {
          intakeUuid,
          submittedAt: new Date().toISOString(),
          paymentRequired: Boolean(payment_link_url),
        },
      },
      { repair: true }
    );
  } catch (error) {
    // If update fails (e.g., duplicate intakeUuid due to race), treat as conflict
    if (error instanceof Error && error.message?.includes('UNIQUE')) {
      Logger.warn('[submitIntake] Conflict on intakeUuid write (likely duplicate submission)', {
        conversationId,
        practiceId,
        intakeUuid,
      });
      throw HttpErrors.conflict('Intake already submitted for this conversation');
    }
    throw error;
  }

  Logger.info('[submitIntake] Intake created and uuid persisted', {
    conversationId,
    practiceId,
    intakeUuid,
    status,
    requiresPayment: Boolean(payment_link_url),
  });

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        intake_uuid: intakeUuid,
        status,
        payment_link_url: payment_link_url ?? null,
        organization: organization ?? null,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
