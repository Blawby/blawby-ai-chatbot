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
      const body = await parseJsonBody(request) as { organizationId: string };
      if (!body.organizationId) {
        throw HttpErrors.badRequest('organizationId is required');
      }
      await requireOrgOwner(request, env, body.organizationId);
      const orgService = new OrganizationService(env);
      await orgService.markBusinessOnboardingComplete(body.organizationId);
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/skip' && request.method === 'POST') {
      await requireAuth(request, env);
      const body = await parseJsonBody(request) as { organizationId: string };
      if (!body.organizationId) {
        throw HttpErrors.badRequest('organizationId is required');
      }
      await requireOrgOwner(request, env, body.organizationId);
      const orgService = new OrganizationService(env);
      await orgService.markBusinessOnboardingSkipped(body.organizationId);
      return createSuccessResponse({ success: true });
    }

    if (path === '/api/onboarding/save' && request.method === 'POST') {
      await requireAuth(request, env);
      const body = await parseJsonBody(request) as { organizationId: string; data: Record<string, unknown> };
      if (!body.organizationId || !body.data) {
        throw HttpErrors.badRequest('organizationId and data are required');
      }
      await requireOrgOwner(request, env, body.organizationId);
      const orgService = new OrganizationService(env);
      await orgService.saveBusinessOnboardingProgress(body.organizationId, body.data);
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


