import type { Env } from '../types';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { requireAuth, requireOrgOwner } from '../middleware/auth.js';
import { OrganizationService } from '../services/OrganizationService.js';
import { parseJsonBody } from '../utils.js';

function validateAndExtractOrgId(parsed: unknown, source: 'body' | 'query'): string {
  if (source === 'body') {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw HttpErrors.badRequest('body must be a JSON object');
    }
    const orgId = (parsed as Record<string, unknown>).organizationId;
    if (typeof orgId !== 'string' || orgId.trim().length === 0) {
      throw HttpErrors.badRequest('organizationId must be a non-empty string');
    }
    return orgId.trim();
  }
  // source === 'query'
  if (typeof parsed !== 'string') {
    throw HttpErrors.badRequest('organizationId is required');
  }
  const trimmed = parsed.trim();
  if (!trimmed) {
    throw HttpErrors.badRequest('organizationId is required');
  }
  return trimmed;
}

export async function handleOnboarding(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/api/onboarding/complete' && request.method === 'POST') {
      const authContext = await requireAuth(request, env);
      let parsed: unknown;
      try {
        parsed = await parseJsonBody(request) as unknown;
      } catch (_err) {
        throw HttpErrors.badRequest('Invalid JSON body');
      }
      const organizationId = validateAndExtractOrgId(parsed, 'body');
      const orgService = new OrganizationService(env);
      await orgService.ensureOwnerMembership(organizationId, authContext.user.id);
      await requireOrgOwner(request, env, organizationId);
      await orgService.markBusinessOnboardingComplete(organizationId);
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/skip' && request.method === 'POST') {
      const authContext = await requireAuth(request, env);
      let parsed: unknown;
      try {
        parsed = await parseJsonBody(request) as unknown;
      } catch (_err) {
        throw HttpErrors.badRequest('Invalid JSON body');
      }
      const orgId = validateAndExtractOrgId(parsed, 'body');
      const orgService = new OrganizationService(env);
      await orgService.ensureOwnerMembership(orgId, authContext.user.id);
      await requireOrgOwner(request, env, orgId);
      const updated = await orgService.markBusinessOnboardingSkipped(orgId);
      if (!updated) {
        throw HttpErrors.notFound('Organization not found');
      }
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/save' && request.method === 'POST') {
      const authContext = await requireAuth(request, env);
      let parsed: unknown;
      try {
        parsed = await parseJsonBody(request) as unknown;
      } catch (_err) {
        throw HttpErrors.badRequest('Invalid JSON body');
      }
      const orgId = validateAndExtractOrgId(parsed, 'body');
      const data = (
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>).data
          : undefined
      );
      const orgService = new OrganizationService(env);
      await orgService.ensureOwnerMembership(orgId, authContext.user.id);
      await requireOrgOwner(request, env, orgId);

      // Proceed with full data validation after ownership check
      const dataErrors: string[] = [];
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        dataErrors.push('data must be a plain non-array object');
      } else if (Object.keys(data as Record<string, unknown>).length === 0) {
        dataErrors.push('data must contain at least one property');
      }
      if (dataErrors.length > 0) {
        throw HttpErrors.badRequest(`Invalid request: ${dataErrors.join('; ')}`);
      }
      const dataObject = data as Record<string, unknown>;
      const dataString = JSON.stringify(dataObject);
      const byteSize = new TextEncoder().encode(dataString).length;
      if (byteSize > 50000) {
        throw HttpErrors.payloadTooLarge('data exceeds maximum size of 50KB');
      }
      await orgService.saveBusinessOnboardingProgress(orgId, dataObject);
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/status' && request.method === 'GET') {
      const authContext = await requireAuth(request, env);
      const organizationId = validateAndExtractOrgId(url.searchParams.get('organizationId'), 'query');
      const orgService = new OrganizationService(env);
      await orgService.ensureOwnerMembership(organizationId, authContext.user.id);
      await requireOrgOwner(request, env, organizationId);
      const status = await orgService.getBusinessOnboardingStatus(organizationId);
      return createSuccessResponse(status);
    }

    throw HttpErrors.notFound('Endpoint not found');
  } catch (error) {
    console.error('Onboarding endpoint error:', error);
    return handleError(error);
  }
}

