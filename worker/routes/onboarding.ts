import type { Env } from '../types';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { requireAuth, requireOrgOwner } from '../middleware/auth.js';
import { OrganizationService } from '../services/OrganizationService.js';
import { parseJsonBody } from '../utils';

export async function handleOnboarding(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/api/onboarding/complete' && request.method === 'POST') {
      await requireAuth(request, env);
      const parsed = await parseJsonBody(request) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        typeof (parsed as Record<string, unknown>).organizationId !== 'string' ||
        !(parsed as Record<string, string>).organizationId.trim()
      ) {
        throw HttpErrors.badRequest('organizationId must be a non-empty string');
      }
      const organizationId = (parsed as Record<string, string>).organizationId.trim();
      await requireOrgOwner(request, env, organizationId);
      const orgService = new OrganizationService(env);
      await orgService.markBusinessOnboardingComplete(organizationId);
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/skip' && request.method === 'POST') {
      await requireAuth(request, env);
      const parsed = await parseJsonBody(request) as unknown;
      const errors: string[] = [];
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push('body must be a JSON object');
      }
      const organizationId = (
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>).organizationId
          : undefined
      );
      if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
        errors.push('organizationId must be a non-empty string');
      }
      if (errors.length > 0) {
        throw HttpErrors.badRequest(`Invalid request: ${errors.join('; ')}`);
      }
      const orgId = (organizationId as string).trim();
      await requireOrgOwner(request, env, orgId);
      const orgService = new OrganizationService(env);
      const updated = await orgService.markBusinessOnboardingSkipped(orgId);
      if (!updated) {
        throw HttpErrors.notFound('Organization not found');
      }
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/save' && request.method === 'POST') {
      await requireAuth(request, env);
      const parsed = await parseJsonBody(request) as unknown;
      const errors: string[] = [];
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push('body must be a JSON object');
      }
      const organizationId = (
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>).organizationId
          : undefined
      );
      const data = (
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>).data
          : undefined
      );
      if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
        errors.push('organizationId must be a non-empty string');
      }
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        errors.push('data must be a plain non-array object');
      } else if (Object.keys(data as Record<string, unknown>).length === 0) {
        errors.push('data must contain at least one property');
      }
      if (errors.length > 0) {
        throw HttpErrors.badRequest(`Invalid request: ${errors.join('; ')}`);
      }
      const orgId = (organizationId as string).trim();
      const dataObject = data as Record<string, unknown>;
      const dataString = JSON.stringify(dataObject);
      if (dataString.length > 50000) {
        throw HttpErrors.payloadTooLarge('data exceeds maximum size of 50KB');
      }
      await requireOrgOwner(request, env, orgId);
      const orgService = new OrganizationService(env);
      await orgService.saveBusinessOnboardingProgress(orgId, dataObject);
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/status' && request.method === 'GET') {
      await requireAuth(request, env);
      const organizationId = url.searchParams.get('organizationId');
      if (!organizationId) {
        throw HttpErrors.badRequest('organizationId is required');
      }
      await requireOrgOwner(request, env, organizationId);
      const orgService = new OrganizationService(env);
      const status = await orgService.getBusinessOnboardingStatus(organizationId);
      return createSuccessResponse(status);
    }

    throw HttpErrors.notFound('Endpoint not found');
  } catch (error) {
    console.error('Onboarding endpoint error:', error);
    return handleError(error);
  }
}


