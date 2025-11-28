import type { Env } from '../types';
import { parseJsonBody } from '../utils.js';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { MatterService } from '../services/MatterService.js';
import { NotificationService } from '../services/NotificationService.js';

type ContactFormPayload = {
  name?: string;
  email?: string;
  phoneNumber?: string;
  sessionId?: string;
  matterDetails?: string;
  organizationId?: string;
};

export async function handleForms(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Only POST method is allowed for /api/forms');
  }

  try {
    const body = await parseJsonBody(request) as ContactFormPayload;
    const matterService = new MatterService(env);

    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      throw HttpErrors.badRequest('organizationId is required');
    }

    const organization = await RemoteApiService.getOrganization(env, organizationId, request);
    if (!organization) {
      throw HttpErrors.notFound('Organization not found');
    }

    const email = body.email?.trim();
    const phoneNumber = body.phoneNumber?.trim();
    const matterDetails = body.matterDetails?.trim();

    if (!email) {
      throw HttpErrors.badRequest('email is required');
    }
    if (!phoneNumber) {
      throw HttpErrors.badRequest('phoneNumber is required');
    }
    if (!matterDetails) {
      throw HttpErrors.badRequest('matterDetails is required');
    }

    const idempotencyKey = request.headers.get('Idempotency-Key') ?? null;
    if (idempotencyKey) {
      const existing = await getIdempotencyResult(env, organization.id, idempotencyKey);
      if (existing) {
        return createSuccessResponse(existing);
      }
    }

    const matter = await matterService.createLeadFromContactForm({
      organizationId: organization.id,
      sessionId: body.sessionId ?? null,
      name: body.name ?? null,
      email,
      phoneNumber,
      matterDetails,
      leadSource: 'contact_form'
    });

    const responsePayload = {
      matterId: matter.matterId,
      matterNumber: matter.matterNumber,
      organizationId: organization.id,
      status: 'lead' as const,
      message: 'Lead submitted successfully. A team member will follow up soon.'
    };

    if (idempotencyKey) {
      await storeIdempotencyResult(env, organization.id, idempotencyKey, responsePayload);
    }

    const notificationService = new NotificationService(env);
    try {
      await notificationService.sendMatterCreatedNotification({
        type: 'matter_created',
        organizationConfig: organization,
        matterInfo: {
          type: 'Lead',
          description: matterDetails,
          urgency: 'standard'
        },
        clientInfo: {
          name: body.name ?? 'New Lead',
          email,
          phone: phoneNumber
        }
      });
    } catch (notifyErr) {
      // Best-effort: log and continue without failing the submission
      console.error('Notification send failed for matter creation', {
        organizationId: organization.id,
        email,
        phoneNumber
      }, notifyErr);
    }

    // Note for future Preact wiring: call POST /api/forms with the user's answers.
    return createSuccessResponse(responsePayload);
  } catch (error) {
    return handleError(error);
  }
}

async function getIdempotencyResult(env: Env, organizationId: string, key: string): Promise<Record<string, unknown> | null> {
  const storageKey = buildIdempotencyKey(organizationId, key);
  const rawValue = await env.CHAT_SESSIONS.get(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
}

async function storeIdempotencyResult(env: Env, organizationId: string, key: string, value: Record<string, unknown>): Promise<void> {
  const storageKey = buildIdempotencyKey(organizationId, key);
  await env.CHAT_SESSIONS.put(storageKey, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 });
}

function buildIdempotencyKey(organizationId: string, key: string): string {
  return `idempotency:forms:${organizationId}:${key}`;
}
