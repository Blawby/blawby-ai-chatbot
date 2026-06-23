import type { Env } from '../types.js';
import { Logger } from '../utils/logger.js';
import { RemoteApiService } from './RemoteApiService.js';
import type {
  BackendIntakeCreatePayload,
  BackendIntakeFailureContext,
} from '../types/wire/intake.js';

/**
 * Fields collected by the slim form before the AI took over. All optional
 * because the slim form may have completed partially before failure.
 */
export interface PartialSlimContactInput {
  name: string | null;
  email: string | null;
  phone: string | null;
  city?: string | null;
  state?: string | null;
}

/**
 * Fields the AI managed to collect via `save_case_details` etc. before failure.
 * Names mirror IntakeConversationState in submitIntake.ts.
 */
export interface PartialCollectedFields {
  description?: string | null;
  urgency?: 'routine' | 'time_sensitive' | 'emergency' | null;
  opposingParty?: string | null;
  desiredOutcome?: string | null;
  courtDate?: string | null;
  hasDocuments?: boolean | null;
  income?: number | null;
  householdSize?: number | null;
  practiceServiceUuid?: string | null;
}

export interface PartialIntakeSubmitInput {
  conversationId: string;
  practiceSlug: string;
  /** Minor units (cents). Use the practice's consultationFee default; 0 if free. */
  amountMinor: number;
  slimContact: PartialSlimContactInput;
  collectedFields?: PartialCollectedFields | null;
  failureContext: BackendIntakeFailureContext;
}

/**
 * Submits a partial intake to backend `POST /api/practice-client-intakes/create`
 * when the AI fails, so leads aren't lost to AI flakiness (R14 / AE5b).
 *
 * Delegates HTTP to `RemoteApiService.createIntake` rather than duplicating the
 * fetch+timeout+forwardAuthCookie plumbing — AGENTS.md "Extend existing
 * abstractions rather than creating parallel ones".
 *
 * Best-effort: never throws. On failure, emits `intake.partial_submit_failed`
 * with status/body context. The user-facing hard-error response (U8) fires
 * regardless of submit outcome — a submit failure must not delay the user's
 * end-of-conversation marker.
 *
 * See U7 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 */
export class PartialIntakeSubmissionService {
  constructor(private env: Env, private request?: Request) {}

  async submit(input: PartialIntakeSubmitInput): Promise<void> {
    if (!this.env.BACKEND_API_URL) {
      Logger.warn('intake.partial_submit_skipped', {
        conversationId: input.conversationId,
        reason: 'backend_url_unset',
      });
      return;
    }

    const payload = buildPayload(input);
    if (!payload) {
      Logger.warn('intake.partial_submit_skipped', {
        conversationId: input.conversationId,
        reason: 'missing_required_fields',
        haveName: Boolean(input.slimContact.name),
        haveEmail: Boolean(input.slimContact.email),
      });
      return;
    }

    try {
      const response = await RemoteApiService.createIntake(this.env, payload, this.request);
      if (!response.ok) {
        let body = '';
        try {
          body = await response.text();
        } catch {
          /* swallow — diagnostic only */
        }
        Logger.warn('intake.partial_submit_failed', {
          conversationId: input.conversationId,
          status: response.status,
          body: body.slice(0, 500),
        });
        return;
      }
      Logger.info('intake.partial_submit_ok', {
        conversationId: input.conversationId,
        reason: input.failureContext.reason,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      Logger.warn('intake.partial_submit_failed', {
        conversationId: input.conversationId,
        reason: isTimeout ? 'timeout' : 'network_error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function safeStringifyFailureContext(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === 'bigint') return nestedValue.toString();
      if (nestedValue && typeof nestedValue === 'object') {
        if (seen.has(nestedValue)) return '[Circular]';
        seen.add(nestedValue);
      }
      return nestedValue;
    });
    return typeof serialized === 'string' ? serialized : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Returns null when the payload cannot be assembled (missing name or email).
 * Backend rejects without both; logging at the call site is more useful than
 * a backend 400 round-trip.
 */
function buildPayload(input: PartialIntakeSubmitInput): BackendIntakeCreatePayload | null {
  const name = input.slimContact.name?.trim();
  const email = input.slimContact.email?.trim();
  if (!name || !email) return null;

  const collected = input.collectedFields ?? null;
  const city = input.slimContact.city?.trim() || null;
  const state = input.slimContact.state?.trim() || null;
  const hasAddress = Boolean(city || state);

  const payload: BackendIntakeCreatePayload = {
    slug: input.practiceSlug,
    amount: input.amountMinor,
    name,
    email,
    phone: input.slimContact.phone?.trim() || undefined,
    description: collected?.description?.trim() || undefined,
    urgency: collected?.urgency ?? undefined,
    opposing_party: collected?.opposingParty?.trim() || undefined,
    desired_outcome: collected?.desiredOutcome?.trim() || undefined,
    court_date: collected?.courtDate?.trim() || undefined,
    has_documents: typeof collected?.hasDocuments === 'boolean' ? collected.hasDocuments : undefined,
    income: typeof collected?.income === 'number' && Number.isFinite(collected.income) ? collected.income : undefined,
    household_size: typeof collected?.householdSize === 'number' && Number.isFinite(collected.householdSize)
      ? collected.householdSize
      : undefined,
    practice_service_uuid: collected?.practiceServiceUuid?.trim() || undefined,
    address: hasAddress
      ? {
          city: city || undefined,
          state: state || undefined,
        }
      : undefined,
    custom_fields: {
      _worker_conversation_id: input.conversationId,
      _failure_context: safeStringifyFailureContext(input.failureContext),
    },
    failure_context: input.failureContext,
  };

  return payload;
}
