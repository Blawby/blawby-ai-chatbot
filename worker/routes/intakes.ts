import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const PAID_INTAKE_STATUSES = new Set(['paid', 'succeeded', 'completed', 'captured']);

const normalizePaymentStatus = (status?: string): string | null => {
  if (typeof status !== 'string') return null;
  const normalized = status.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const isIsoDateTime = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!ISO_DATE_TIME_PATTERN.test(trimmed)) return false;
  return Number.isFinite(Date.parse(trimmed));
};

/**
 * Proxy for POST /api/practice/client-intakes/create
 *
 * Enriches the intake payload with AI-collected fields from the conversation
 * before forwarding to the backend API. No local state is written.
 *
 * Uses direct field mapping now that backend Change 3 has shipped.
 * Maps conversation AI fields directly to typed backend intake fields.
 */
export async function handlePracticeIntakeCreate(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const body = await parseJsonBody(request) as Record<string, unknown>;
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';

  if (conversationId) {
    try {
      const conversationService = new ConversationService(env);
      // Fetch conversation first to get the correct practiceId for message retrieval
      const conversation = await conversationService.getConversationById(conversationId);
      const practiceId = conversation.practice_id;
      const result = await conversationService.getMessages(conversationId, practiceId, { limit: 50 });

      const latestIntakeMessage = [...result.messages]
        .reverse()
        .find((msg) => msg.role === 'system' && isRecord(msg.metadata) && msg.metadata.intakeFields);

      if (latestIntakeMessage && isRecord(latestIntakeMessage.metadata)) {
        const intakeFields = latestIntakeMessage.metadata.intakeFields as Record<string, unknown>;

        // Map urgency (enum field)
        const urgency = typeof intakeFields.urgency === 'string' ? intakeFields.urgency.trim() : '';
        if (urgency && (urgency === 'routine' || urgency === 'time_sensitive' || urgency === 'emergency')) {
          body.urgency = urgency;
        }

        // Map court_date (ISO8601 date)
        const courtDate = typeof intakeFields.courtDate === 'string' ? intakeFields.courtDate.trim() : '';
        if (courtDate) {
          if (isIsoDateTime(courtDate)) {
            body.court_date = courtDate;
          } else {
            console.warn('[Intake] Skipping non-ISO courtDate from AI fields', { courtDate });
          }
        }

        // Map desired_outcome
        if (typeof intakeFields.desiredOutcome === 'string' && intakeFields.desiredOutcome.trim()) {
          body.desired_outcome = intakeFields.desiredOutcome.trim();
        }

        // Map has_documents
        if (typeof intakeFields.hasDocuments === 'boolean') {
          body.has_documents = intakeFields.hasDocuments;
        }

        // Map income (sanitize and parse)
        if (intakeFields.income != null && intakeFields.income !== '') {
          const rawIncome = String(intakeFields.income);
          // Sanitize: strip currency symbols, commas, and common non-numeric text
          const sanitizedIncome = rawIncome.replace(/[$,\s]/g, '').replace(/[^0-9.]/g, '');
          const income = parseFloat(sanitizedIncome);
          
          if (!isNaN(income) && income >= 0) {
            body.income = Math.round(income);
          } else {
            console.warn('[Intake] Failed to parse income', { rawValue: intakeFields.income });
          }
        }

        // Map household_size (round to integer, minimum 1)
        if (intakeFields.householdSize != null && intakeFields.householdSize !== '') {
          const parsedSize = parseFloat(String(intakeFields.householdSize));
          if (!isNaN(parsedSize) && parsedSize >= 1) {
            body.household_size = Math.max(1, Math.round(parsedSize));
          }
        }

        // Map case_strength (0-1 float)
        if (typeof intakeFields.caseStrength === 'string') {
          const strength = intakeFields.caseStrength.trim();
          // Map LLM string values to numeric scores
          const strengthMap: Record<string, number> = {
            'needs_more_info': 0.2,
            'developing': 0.5,
            'strong': 0.9
          };
          if (strength in strengthMap) {
            body.case_strength = strengthMap[strength];
          }
        } else if (typeof intakeFields.caseStrength === 'number') {
          const strength = intakeFields.caseStrength;
          if (strength >= 0 && strength <= 1) {
            body.case_strength = strength;
          }
        }

        // Map opposing_party from AI fields if not already provided
        if (
          !body.opposing_party &&
          typeof intakeFields.opposingParty === 'string' &&
          intakeFields.opposingParty.trim()
        ) {
          body.opposing_party = intakeFields.opposingParty.trim();
        }
      }
    } catch (error) {
      // Log but do not block — intake creation proceeds without enrichment
      console.warn('[Intake] Failed to enrich payload with AI fields', error);
    }
  }

  return RemoteApiService.createIntake(env, body, request);
}

export async function handlePracticeIntakeConfirm(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const prefix = '/api/practice/client-intakes/';
  const suffix = '/confirm';

  if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith(suffix)) {
    throw HttpErrors.notFound('Endpoint not found');
  }

  const encodedUuid = url.pathname.slice(prefix.length, -suffix.length);
  if (!encodedUuid || encodedUuid.includes('/')) {
    throw HttpErrors.badRequest('intake uuid is required');
  }

  let intakeUuid: string;
  try {
    intakeUuid = decodeURIComponent(encodedUuid).trim();
  } catch {
    throw HttpErrors.badRequest('Invalid intake uuid encoding');
  }

  if (!intakeUuid) {
    throw HttpErrors.badRequest('intake uuid is required');
  }

  const body = await parseJsonBody(request) as Record<string, unknown>;
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  const practiceId = typeof body.practiceId === 'string' ? body.practiceId.trim() : '';
  const aiSummary = typeof body.aiSummary === 'string' ? body.aiSummary.trim() : '';

  if (!conversationId) {
    throw HttpErrors.badRequest('conversationId is required');
  }
  if (!practiceId) {
    throw HttpErrors.badRequest('practiceId is required');
  }
  if (!aiSummary) {
    throw HttpErrors.badRequest('aiSummary is required');
  }

  const intakeStatus = await RemoteApiService.getPracticeClientIntakeStatus(env, intakeUuid, request);
  if (intakeStatus === null) {
    throw HttpErrors.notFound(`Intake not found: ${intakeUuid}`);
  }

  const verifiedPaymentStatus = normalizePaymentStatus(intakeStatus.status);
  const paymentConfirmed = Boolean(intakeStatus.succeeded_at) || (
    verifiedPaymentStatus !== null && PAID_INTAKE_STATUSES.has(verifiedPaymentStatus)
  );
  if (!paymentConfirmed) {
    throw HttpErrors.paymentRequired('Intake payment must be confirmed before converting to matter', {
      intakeUuid,
      paymentStatus: verifiedPaymentStatus,
      succeededAt: intakeStatus.succeeded_at ?? null
    });
  }

  const convertResult = await RemoteApiService.convertIntake(
    env,
    intakeUuid,
    { description: aiSummary },
    request
  );

  const conversationService = new ConversationService(env);
  try {
    await conversationService.sendSystemMessage({
      conversationId,
      practiceId,
      content: aiSummary,
      metadata: {
        systemMessageKey: 'intake_summary',
        matterId: convertResult.matter_id,
        leadId: convertResult.matter_id,
        intakeUuid,
        paymentStatus: verifiedPaymentStatus ?? 'succeeded'
      }
    });
  } catch (error) {
    console.error('[IntakeConfirm] Failed to send system message after successful conversion', {
      intakeUuid,
      matterId: convertResult.matter_id,
      conversationId,
      practiceId,
      error: error instanceof Error ? error.message : String(error)
    });
    // Intake conversion has already succeeded in remote API; do not fail this request.
  }

  return new Response(JSON.stringify({
    success: true,
    data: {
      matter_id: convertResult.matter_id
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
