import type { Env } from '../types';
import { parseJsonBody } from '../utils.js';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { OrganizationService } from '../services/OrganizationService.js';
import { requireOrgMember } from '../middleware/auth.js';

type ContactFormPayload = {
  name?: string;
  email?: string;
  phoneNumber?: string;
  sessionId?: string;
  matterDetails?: string;
  organizationId?: string;
};

export async function handleForms(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const organizationId = url.searchParams.get('organizationId');
    if (!organizationId) {
      throw HttpErrors.badRequest('organizationId query parameter is required');
    }

    // Resolve organization by ID or slug to get canonical numeric ID
    const organizationService = new OrganizationService(env);
    const organization = await organizationService.getOrganization(organizationId);
    if (!organization) {
      throw HttpErrors.notFound('Organization not found');
    }

    // Require at least admin membership to read submissions using canonical ID
    await requireOrgMember(request, env, organization.id, 'admin');

    const forms = await env.DB.prepare(
      `SELECT id,
              organization_id as organizationId,
              conversation_id as conversationId,
              phone_number as phoneNumber,
              email,
              matter_details as matterDetails,
              status,
              assigned_lawyer as assignedLawyer,
              notes,
              created_at as createdAt,
              updated_at as updatedAt
         FROM contact_forms
        WHERE organization_id = ?
        ORDER BY created_at DESC`
    ).bind(organization.id).all();

    // Future Preact usage: fetch this endpoint inside an org dashboard to render submissions.
    return createSuccessResponse({
      submissions: forms.results?.map(form => ({
        ...form,
        notes: typeof form.notes === 'string'
          ? safeParseNotes(form.notes)
          : form.notes
      })) ?? []
    });
  }

  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Only POST method is allowed');
  }

  try {
    const body = await parseJsonBody(request) as ContactFormPayload;
    const organizationService = new OrganizationService(env);

    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      throw HttpErrors.badRequest('organizationId is required');
    }

    const organization = await organizationService.getOrganization(organizationId);
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

    const contactFormId = crypto.randomUUID();
    const notes = JSON.stringify({
      name: body.name ?? null
    });

    await env.DB.prepare(
      `INSERT INTO contact_forms (
         id,
         organization_id,
         conversation_id,
         phone_number,
         email,
         matter_details,
         status,
         assigned_lawyer,
         notes
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`
    ).bind(
      contactFormId,
      organization.id,
      body.sessionId ?? null,
      phoneNumber,
      email,
      matterDetails,
      notes
    ).run();

    // Note for future Preact wiring: call POST /api/forms with the user's answers.
    return createSuccessResponse({
      id: contactFormId,
      organizationId: organization.id,
      message: 'Contact form saved. A team member will follow up soon.'
    });
  } catch (error) {
    return handleError(error);
  }
}

function safeParseNotes(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}
