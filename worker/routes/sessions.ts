import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { HttpError } from '../types.js';
import { SessionService } from '../services/SessionService.js';
import { sessionRequestBodySchema } from '../schemas/validation.js';
import { withPracticeContext, getPracticeId, withOrganizationContext, getOrganizationId } from '../middleware/practiceContext.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { PLATFORM_ORGANIZATION_ID } from '../../src/utils/constants.js';

async function normalizePracticeId(env: Env, practiceId?: string | null, request?: Request): Promise<string> {
  if (!practiceId) {
    return PLATFORM_ORGANIZATION_ID; // Use default instead of throwing error
  }
  const trimmed = practiceId.trim();
  if (!trimmed) {
    return PLATFORM_ORGANIZATION_ID; // Use default instead of throwing error
  }

  // Skip remote validation for special sentinel values
  if (trimmed === PLATFORM_ORGANIZATION_ID || trimmed === 'public') {
    return trimmed;
  }

  // Validate practice exists via remote API
  try {
    const practice = await RemoteApiService.getPractice(env, trimmed, request);
    if (!practice || !practice.id) {
      throw HttpErrors.notFound(`Practice not found: ${trimmed}`);
    }
    return practice.id;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw error;
    }
    console.error('[normalizePracticeId] Remote API call failed', {
      practiceId: trimmed,
      error: error instanceof Error ? error.message : String(error),
    });
    throw HttpErrors.serviceUnavailable('Failed to validate practice');
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

  // PATCH /api/sessions/practice (Phase 1 stub)
  if (segments.length === 3 && (segments[2] === 'practice' || segments[2] === 'organization') && request.method === 'PATCH') {
    const body = await parseJsonBody(request) as { practiceId?: string };
    if (!body?.practiceId || typeof body.practiceId !== 'string') {
      throw HttpErrors.badRequest('practiceId is required');
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
    
    // Determine practice ID: body takes precedence over URL param
    let practiceId: string;
    const bodyPracticeId = (body as any).practiceId;
    if (bodyPracticeId) {
      // Use practice from request body
      practiceId = await normalizePracticeId(env, bodyPracticeId, request);
    } else {
      // Use practice context middleware to extract from URL/cookies
      const requestWithContext = await withPracticeContext(request, env, {
        requirePractice: false,  // Allow fallback to default
        allowUrlOverride: true,
        defaultPracticeId: PLATFORM_ORGANIZATION_ID
      });
      const contextPracticeId = getPracticeId(requestWithContext) || PLATFORM_ORGANIZATION_ID;
      practiceId = await normalizePracticeId(env, contextPracticeId, request);
    }

    const resolution = await SessionService.resolveSession(env, {
      request,
      sessionId: body.sessionId,
      sessionToken: body.sessionToken,
      practiceId,
      retentionHorizonDays: body.retentionHorizonDays,
      createIfMissing: true
    });

    const maxAgeSeconds = SessionService.getCookieMaxAgeSeconds();
    const expiresAt = new Date(Date.now() + 1000 * maxAgeSeconds).toISOString();

    return createJsonResponse({
      sessionId: resolution.session.id,
      practiceId: resolution.session.practiceId,
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
    
    // Use practice context middleware
    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: false, // Allow fallback for GET requests
      defaultPracticeId: 'public'
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
      const fallbackPracticeId = await normalizePracticeId(env, getPracticeId(requestWithContext), request);
      const fallback = {
        sessionId,
        practiceId: fallbackPracticeId,
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

    // Validate practice access using context
    const contextPracticeId = getPracticeId(requestWithContext);
    if (contextPracticeId !== 'public') {
      const requestedPractice = await normalizePracticeId(env, contextPracticeId, request);
      if (requestedPractice !== session.practiceId) {
        throw HttpErrors.notFound('Session not found for requested practice');
      }
    }

    const data = {
      sessionId: session.id,
      practiceId: session.practiceId,
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
