import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { HttpError } from '../types.js';
import { SessionService } from '../services/SessionService.js';
import { sessionRequestBodySchema } from '../schemas/validation.js';
import { withOrganizationContext, getOrganizationId } from '../middleware/organizationContext.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { DEFAULT_ORGANIZATION_ID } from '../../src/utils/constants.js';

async function normalizeOrganizationId(env: Env, organizationId?: string | null, request?: Request): Promise<string> {
  if (!organizationId) {
    return DEFAULT_ORGANIZATION_ID; // Use default instead of throwing error
  }
  const trimmed = organizationId.trim();
  if (!trimmed) {
    return DEFAULT_ORGANIZATION_ID; // Use default instead of throwing error
  }

  // Skip remote validation for special sentinel values
  if (trimmed === DEFAULT_ORGANIZATION_ID || trimmed === 'public') {
    return trimmed;
  }

  // Validate organization exists via remote API
  try {
    const organization = await RemoteApiService.getOrganization(env, trimmed, request);
    if (!organization || !organization.id) {
      throw HttpErrors.notFound(`Organization not found: ${trimmed}`);
    }
    return organization.id;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw error;
    }
    console.error('[normalizeOrganizationId] Remote API call failed', {
      organizationId: trimmed,
      error: error instanceof Error ? error.message : String(error),
    });
    throw HttpErrors.serviceUnavailable('Failed to validate organization');
  }
}

function createJsonResponse(data: unknown, setCookie?: string[]): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (setCookie) {
    for (const cookie of setCookie) {
      if (cookie) headers.append('Set-Cookie', cookie);
    }
  }
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers
  });
}

export async function handleSessions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] !== 'api' || segments[1] !== 'sessions') {
    throw HttpErrors.notFound('Session route not found');
  }

  // PATCH /api/sessions/organization (Phase 1 stub)
  if (segments.length === 3 && segments[2] === 'organization' && request.method === 'PATCH') {
    const body = await parseJsonBody(request) as { organizationId?: string };
    if (!body?.organizationId || typeof body.organizationId !== 'string') {
      throw HttpErrors.badRequest('organizationId is required');
    }
    // Phase 1: Do not persist. Just acknowledge.
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST /api/sessions
  if (segments.length === 2 && request.method === 'POST') {
    const rawBody = await parseJsonBody(request);
    
    // Runtime validation of request body
    const validationResult = sessionRequestBodySchema.safeParse(rawBody);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      throw HttpErrors.badRequest(`Invalid request body: ${errorMessages}`);
    }
    
    const body = validationResult.data;
    
    // Determine organization ID: body takes precedence over URL param
    let organizationId: string;
    if (body.organizationId) {
      // Use organization from request body
      organizationId = await normalizeOrganizationId(env, body.organizationId, request);
    } else {
      // Use organization context middleware to extract from URL/cookies
      const requestWithContext = await withOrganizationContext(request, env, {
        requireOrganization: false,  // Allow fallback to default
        allowUrlOverride: true,
        defaultOrganizationId: DEFAULT_ORGANIZATION_ID
      });
      const contextOrgId = getOrganizationId(requestWithContext) || DEFAULT_ORGANIZATION_ID;
      organizationId = await normalizeOrganizationId(env, contextOrgId, request);
    }

    const resolution = await SessionService.resolveSession(env, {
      request,
      sessionId: body.sessionId,
      sessionToken: body.sessionToken,
      organizationId,
      retentionHorizonDays: body.retentionHorizonDays,
      createIfMissing: true
    });

    const maxAgeSeconds = SessionService.getCookieMaxAgeSeconds();
    const expiresAt = new Date(Date.now() + 1000 * maxAgeSeconds).toISOString();

    return createJsonResponse({
      sessionId: resolution.session.id,
      organizationId: resolution.session.organizationId,
      state: resolution.session.state,
      lastActive: resolution.session.lastActive,
      createdAt: resolution.session.createdAt,
      retentionHorizonDays: resolution.session.retentionHorizonDays,
      isHold: resolution.session.isHold,
      closedAt: resolution.session.closedAt,
      sessionToken: resolution.sessionToken,
      isNew: resolution.isNew,
      expiresAt,
      isEphemeral: resolution.isEphemeral ?? false
    }, resolution.cookie ? [resolution.cookie] : undefined);
  }

  // GET /api/sessions/:id
  if (segments.length === 3 && request.method === 'GET') {
    const sessionId = segments[2];
    if (!sessionId) {
      throw HttpErrors.badRequest('Session ID is required');
    }
    
    // Use organization context middleware
    const requestWithContext = await withOrganizationContext(request, env, {
      requireOrganization: false, // Allow fallback for GET requests
      defaultOrganizationId: 'public'
    });
    
    let session: Awaited<ReturnType<typeof SessionService.getSessionById>>;
    try {
      session = await SessionService.getSessionById(env, sessionId);
    } catch (error) {
      console.warn('[SessionsRoute] Failed to load session, falling back to ephemeral view', {
        sessionId,
        message: error instanceof Error ? error.message : String(error)
      });
      session = null;
    }

    if (!session) {
      const fallbackOrganizationId = await normalizeOrganizationId(env, getOrganizationId(requestWithContext), request);
      const fallback = {
        sessionId,
        organizationId: fallbackOrganizationId,
        state: 'active' as const,
        statusReason: 'ephemeral_fallback',
        retentionHorizonDays: 180,
        isHold: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        closedAt: null
      };
      return createJsonResponse(fallback);
    }

    // Validate organization access using context
    const contextOrganizationId = getOrganizationId(requestWithContext);
    if (contextOrganizationId !== 'public') {
      const requestedOrganization = await normalizeOrganizationId(env, contextOrganizationId, request);
      if (requestedOrganization !== session.organizationId) {
        throw HttpErrors.notFound('Session not found for requested organization');
      }
    }

    const data = {
      sessionId: session.id,
      organizationId: session.organizationId,
      state: session.state,
      statusReason: session.statusReason,
      retentionHorizonDays: session.retentionHorizonDays,
      isHold: session.isHold,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastActive: session.lastActive,
      closedAt: session.closedAt
    };

    return createJsonResponse(data);
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for sessions endpoint');
}
