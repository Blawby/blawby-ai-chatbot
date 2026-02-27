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
import { optionalAuth } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';

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
  desiredOutcome?: string | null;
  courtDate?: string | null;
  caseStrength?: 'needs_more_info' | 'developing' | 'strong' | null;
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

interface BackendIntakeCreatePayload {
  slug: string;
  amount: number;
  name: string;
  email: string;
  phone?: string;
  conversation_id: string;
  description?: string;
  urgency?: string;
  opposing_party?: string;
  desired_outcome?: string;
  court_date?: string;
  case_strength?: number;
  has_documents?: boolean;
  income?: string;
  household_size?: number;
  city?: string;
  state?: string;
}

interface BackendIntakeCreateResponse {
  success: boolean;
  data?: {
    uuid: string;
    status: string;
    payment_link_url: string | null;
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

const buildIntakePayload = (
  conversationId: string,
  slug: string,
  draft: SlimContactDraft,
  intake: IntakeConversationState | null | undefined,
  options?: {
    amountMinor?: number;
  }
): BackendIntakeCreatePayload => {
  const normalizeAmount = (value: number | undefined): number => {
    const min = 50;
    const max = 99_999_999;
    if (typeof value !== 'number' || !Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
  };
  const mapCaseStrength = (value: IntakeConversationState['caseStrength']): number | undefined => {
    if (!value) return undefined;
    if (value === 'needs_more_info') return 0;
    if (value === 'developing') return 1;
    if (value === 'strong') return 1;
    return undefined;
  };

  const payload: BackendIntakeCreatePayload = {
    slug,
    amount: normalizeAmount(options?.amountMinor),
    name: draft.name,
    email: draft.email,
    conversation_id: conversationId,
  };

  if (draft.phone) payload.phone = draft.phone;
  if (draft.city) payload.city = draft.city;
  if (draft.state) payload.state = draft.state;

  // Merge AI-enriched fields — intake fields take precedence over draft
  const description = intake?.description?.trim() || draft.description?.trim();
  if (description) payload.description = description;

  const opposingParty = intake?.opposingParty?.trim() || draft.opposingParty?.trim();
  if (opposingParty) payload.opposing_party = opposingParty;

  if (intake?.urgency) payload.urgency = intake.urgency;
  if (intake?.desiredOutcome) payload.desired_outcome = intake.desiredOutcome;
  if (intake?.courtDate) payload.court_date = intake.courtDate;
  const caseStrengthScore = mapCaseStrength(intake?.caseStrength);
  if (typeof caseStrengthScore === 'number') payload.case_strength = caseStrengthScore;
  if (typeof intake?.hasDocuments === 'boolean') payload.has_documents = intake.hasDocuments;
  if (intake?.income) payload.income = intake.income;
  if (typeof intake?.householdSize === 'number') payload.household_size = intake.householdSize;

  return payload;
};

// ------------------------------------------------------------------
// Handler
// ------------------------------------------------------------------

export async function handleSubmitIntake(
  request: Request,
  env: Env,
  conversationId: string
): Promise<Response> {
  // Auth — authentication is required to submit intakes
  const authContext = await optionalAuth(request, env);
  if (!authContext) {
    throw HttpErrors.unauthorized('Authentication required');
  }
  const userId = authContext.user.id;

  // Practice context
  const requestWithContext = await withPracticeContext(request, env, { requirePractice: true });
  const practiceId = getPracticeId(requestWithContext);

  const conversationService = new ConversationService(env);

  // Validate participant access
  await conversationService.validateParticipantAccess(conversationId, practiceId, userId);

  // Load conversation with row lock to prevent concurrent duplicate submissions
  const conversation = await conversationService.getConversation(conversationId, practiceId);
  const userInfo = (conversation.user_info ?? {}) as ConversationUserInfo;

  // Early exit if already submitted (best-effort check before lock)
  if (userInfo.intakeUuid) {
    Logger.warn('[submitIntake] Intake already submitted, returning existing UUID', {
      conversationId,
      practiceId,
      existingIntakeUuid: userInfo.intakeUuid,
    });
    // Return the existing intake UUID idempotently
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          intake_uuid: userInfo.intakeUuid,
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
    throw HttpErrors.badRequest('Practice slug not found on conversation — cannot submit intake');
  }

  // Validate draft
  const draft = normalizeSlimContactDraft(userInfo.intakeSlimContactDraft);
  if (!draft) {
    throw HttpErrors.badRequest('Contact details are incomplete — name and email are required');
  }

  const intake = userInfo.intakeConversationState as IntakeConversationState | null | undefined;

  const intakeSettings = await RemoteApiService.getPracticeClientIntakeSettings(env, slug, request).catch((error) => {
    Logger.warn('[submitIntake] Failed to load intake settings; using fallback amount', {
      conversationId,
      practiceId,
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  // Build backend payload
  const intakePayload = buildIntakePayload(conversationId, slug, draft, intake, {
    amountMinor: typeof intakeSettings?.prefillAmount === 'number' ? intakeSettings.prefillAmount : undefined,
  });

  Logger.info('[submitIntake] Calling backend intake create', {
    conversationId,
    practiceId,
    slug,
    hasIntakeFields: Boolean(intake),
    caseStrength: intake?.caseStrength ?? null,
    amountMinor: intakePayload.amount,
  });

  // Call backend API via existing RemoteApiService pattern
  const backendResponse = await RemoteApiService.createIntake(
    env,
    intakePayload as unknown as Record<string, unknown>,
    request
  );
  const backendPayload = await backendResponse.json().catch(() => null) as BackendIntakeCreateResponse | null;

  if (!backendPayload?.success || !backendPayload.data?.uuid) {
    const errorDetails = backendPayload?.error ?? 'No uuid returned';
    Logger.error('[submitIntake] Backend intake create failed', {
      conversationId,
      practiceId,
      error: errorDetails,
    });
    throw HttpErrors.internalServerError(
      'Failed to create intake — please try again'
    );
  }

  const { uuid: intakeUuid, status, payment_link_url } = backendPayload.data;

  // Persist intake_uuid back into D1 conversation metadata
  const updatedUserInfo: ConversationUserInfo = {
    ...userInfo,
    intakeUuid,
  };

  try {
    await conversationService.updateConversation(conversationId, practiceId, {
      metadata: updatedUserInfo,
    });
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
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
