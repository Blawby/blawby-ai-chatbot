import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { SessionService } from '../services/SessionService.js';
import { sessionRequestBodySchema } from '../schemas/validation.js';
import { withOrganizationContext, getOrganizationId } from '../middleware/organizationContext.js';
import { getBackendAuth } from '../middleware/backendAuth.js';
import { DEFAULT_ORGANIZATION_ID } from '../../src/utils/constants.js';

async function normalizeOrganizationId(env: Env, organizationId?: string | null): Promise<string> {
  if (!organizationId) {
    return DEFAULT_ORGANIZATION_ID; // Use default instead of throwing error
  }
  const trimmed = organizationId.trim();
  if (!trimmed) {
    return DEFAULT_ORGANIZATION_ID; // Use default instead of throwing error
  }

  // Try to find organization by ID (ULID) first, then by slug
  let organizationRow = await env.DB.prepare(
    'SELECT id FROM organizations WHERE id = ?'
  ).bind(trimmed).first();
  
  if (!organizationRow) {
    organizationRow = await env.DB.prepare(
      'SELECT id FROM organizations WHERE slug = ?'
    ).bind(trimmed).first();
  }
  
  if (organizationRow) {
    return organizationRow.id as string;
  }
  
  // If no organization found, return the original trimmed value
  // This will cause a foreign key constraint error, but that's better than silent failure
  return trimmed;
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

  // POST /api/sessions
  if (segments.length === 2 && request.method === 'POST') {
    // Optional backend authentication (allow anonymous chat)
    const authContext = await getBackendAuth(request, env);

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
    
    // Determine organization ID: body takes precedence over auth context
    let organizationId: string;
    if (body.organizationId) {
      // Use organization from request body
      organizationId = await normalizeOrganizationId(env, body.organizationId);
    } else if (authContext?.organizationId) {
      // Use organization from auth context
      organizationId = await normalizeOrganizationId(env, authContext.organizationId);
    } else {
      // Fallback to default
      organizationId = DEFAULT_ORGANIZATION_ID;
    }

    const resolution = await SessionService.resolveSession(env, {
      request,
      sessionId: body.sessionId,
      sessionToken: body.sessionToken,
      organizationId,
      userId: authContext?.user.id,
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
      const fallbackOrganizationId = await normalizeOrganizationId(env, getOrganizationId(requestWithContext));
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
      const requestedOrganization = await normalizeOrganizationId(env, contextOrganizationId);
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
