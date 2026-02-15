import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { ConversationService } from '../services/ConversationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { calculateFPL } from '../utils/calculateFPL.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Proxy for POST /api/practice/client-intakes/create
 *
 * Enriches the intake payload with AI-collected fields from the conversation
 * before forwarding to the backend API. No local state is written.
 *
 * Enrichments applied (W1 + W2 + W4):
 * - conversation_id passed through from body
 * - urgency + courtDate prepended to description as readable prefixes
 * - income, household_size, desiredOutcome, caseStrength appended as JSON blob
 * - fpl_percentage + fee_tier calculated and included in JSON blob if income
 *   and household_size are both present
 * - opposing_party mapped from intakeFields.opposingParty if not already in body
 *
 * When backend ships typed fields (Change 3), replace the description
 * stuffing with direct field mapping and remove the JSON blob.
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
      const result = await conversationService.getMessages(conversationId, '', { limit: 50 });

      const latestIntakeMessage = [...result.messages]
        .reverse()
        .find((msg) => msg.role === 'system' && isRecord(msg.metadata) && msg.metadata.intakeFields);

      if (latestIntakeMessage && isRecord(latestIntakeMessage.metadata)) {
        const intakeFields = latestIntakeMessage.metadata.intakeFields as Record<string, unknown>;
        let description = typeof body.description === 'string' ? body.description.trim() : '';

        // Prefix urgency and court date onto description
        const urgency = typeof intakeFields.urgency === 'string' ? intakeFields.urgency.trim() : '';
        const courtDate = typeof intakeFields.courtDate === 'string' ? intakeFields.courtDate.trim() : '';

        const prefixes: string[] = [];
        if (urgency) prefixes.push(`[Urgency: ${urgency}]`);
        if (courtDate) prefixes.push(`[Court Date: ${courtDate}]`);
        if (prefixes.length > 0) {
          description = `${prefixes.join(' ')}${description ? ' ' + description : ''}`;
        }

        // Append structured data as JSON blob
        // TODO: replace with typed fields once backend Change 3 ships
        const extraData: Record<string, unknown> = {};

        const income = intakeFields.income != null && intakeFields.income !== ''
          ? Number(intakeFields.income)
          : NaN;
        const householdSize = intakeFields.householdSize != null && intakeFields.householdSize !== ''
          ? Number(intakeFields.householdSize)
          : NaN;

        if (!isNaN(income)) extraData.income = income;
        if (!isNaN(householdSize)) extraData.household_size = householdSize;
        if (intakeFields.desiredOutcome) extraData.desired_outcome = intakeFields.desiredOutcome;
        if (intakeFields.caseStrength) extraData.case_strength = intakeFields.caseStrength;

        if (!isNaN(income) && !isNaN(householdSize) && householdSize > 0) {
          const { percentage, tier } = calculateFPL(income, householdSize);
          extraData.fpl_percentage = percentage;
          extraData.fee_tier = tier;
        }

        if (Object.keys(extraData).length > 0) {
          description = `${description}${description ? '\n\n' : ''}JSON_DATA: ${JSON.stringify(extraData)}`;
        }

        body.description = description;

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

/**
 * Confirm handler — intentionally removed.
 *
 * Previously created matters in local D1 after payment confirmation.
 * This is now handled by the backend /convert endpoint (backend Change 2).
 * The Worker no longer owns matter creation or local matter state.
 *
 * When backend Change 2 ships, add handlePracticeIntakeConfirm here that
 * calls POST /api/practice/client-intakes/{uuid}/convert with the
 * AI-generated description as the matter description.
 */