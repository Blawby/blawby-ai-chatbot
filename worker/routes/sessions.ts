import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { SessionService } from '../services/SessionService.js';
import { sessionRequestBodySchema } from '../schemas/validation.js';
import { withOrganizationContext, getOrganizationId } from '../middleware/organizationContext.js';

async function normalizeOrganizationId(env: Env, organizationId?: string | null): Promise<string> {
  if (!organizationId || typeof organizationId !== 'string') {
    throw HttpErrors.badRequest('organizationId is required');
  }

  const trimmed = organizationId.trim();
  if (!trimmed) {
    throw HttpErrors.badRequest('organizationId is required');
  }

  const organizationRow = await env.DB.prepare(
    'SELECT id FROM organizations WHERE id = ? OR slug = ?'
  ).bind(trimmed, trimmed).first<{ id: string }>();

  if (!organizationRow) {
    throw HttpErrors.notFound('Organization not found');
  }

  return organizationRow.id;
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
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const rateKey = `sessions:rate:${ip}`;
    const rateCount = Number(await env.CHAT_SESSIONS.get(rateKey) ?? '0');
    if (!Number.isNaN(rateCount) && rateCount >= 30) {
      throw HttpErrors.tooManyRequests('Too many session requests from this client');
    }

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
    let organizationIdSource = body.organizationId ?? null;
    if (!organizationIdSource) {
      const requestWithContext = await withOrganizationContext(request, env, {
        requireOrganization: true,
        allowUrlOverride: true
      });
      organizationIdSource = getOrganizationId(requestWithContext);
    }

    const organizationId = await normalizeOrganizationId(env, organizationIdSource);

    const resolution = await SessionService.resolveSession(env, {
      request,
      sessionId: body.sessionId,
      sessionToken: body.sessionToken,
      organizationId,
      retentionHorizonDays: body.retentionHorizonDays,
      createIfMissing: true
    });

    await env.CHAT_SESSIONS.put(rateKey, String(rateCount + 1), { expirationTtl: 60 });

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
    
    const requestWithContext = await withOrganizationContext(request, env, {
      requireOrganization: true,
      allowUrlOverride: true
    });

    const contextOrganizationId = getOrganizationId(requestWithContext);
    const organizationId = await normalizeOrganizationId(env, contextOrganizationId);

    const session = await SessionService.getSessionById(env, sessionId);

    if (!session || session.organizationId !== organizationId) {
      throw HttpErrors.notFound('Session not found for requested organization');
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
