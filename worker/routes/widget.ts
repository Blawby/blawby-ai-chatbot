import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { Logger } from '../utils/logger.js';
import { ConversationService } from '../services/ConversationService.js';
import {
  extractWidgetTokenFromRequest,
  getWidgetTokenTtlForSource,
  issueWidgetAuthToken,
  validateWidgetAuthToken
} from '../utils/widgetAuthToken.js';
import type { IntakeTemplate } from '../../src/shared/types/intake.js';
import { DEFAULT_INTAKE_TEMPLATE } from '../../src/shared/constants/intakeTemplates.js';

const normalizeCrossSiteWidgetCookie = (cookie: string, request: Request): string => {
  const protocol = new URL(request.url).protocol;
  // Secure cookies are ignored on http://localhost in dev; keep upstream cookie
  // as-is unless this request is served over HTTPS.
  if (protocol !== 'https:') {
    return cookie;
  }

  let normalized = cookie;
  if (/;\s*SameSite=/i.test(normalized)) {
    normalized = normalized.replace(/;\s*SameSite=[^;]*/i, '; SameSite=None');
  } else {
    normalized = `${normalized}; SameSite=None`;
  }
  if (!/;\s*Secure\b/i.test(normalized)) {
    normalized = `${normalized}; Secure`;
  }
  if (!/;\s*Partitioned\b/i.test(normalized)) {
    normalized = `${normalized}; Partitioned`;
  }
  return normalized;
};

export async function handleWidgetBootstrap(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    throw HttpErrors.badRequest('slug parameter is required');
  }

  // ?template param — resolved after practice details arrive
  const templateSlugParam = url.searchParams.get('template')?.trim() || null;

  // Define headers for upstream calls
  const incomingCookie = request.headers.get('Cookie');
  const headers = new Headers();
  if (incomingCookie) {
    headers.set('Cookie', incomingCookie);
  }

  const upstreamHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    upstreamHeaders[key] = value;
  });

  // 1. Fetch practice details (in parallel with session check)
  const getPracticeDetails = (async () => {
    const res = await RemoteApiService.getPublicPracticeDetails(env, slug, request);
    if (!res.ok) {
      if (res.status === 404) {
        throw HttpErrors.notFound('Practice not found');
      }
      const text = await res.text().catch(() => 'No body');
      throw new Error(`[Bootstrap] Error fetching practice details: ${res.status} - ${text}`);
    }
    try {
      return await res.json();
    } catch (parseErr) {
      throw new Error(`[Bootstrap] Failed to parse JSON from upstream practice details: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    }
  })();

  // 2. Manage Session (Check session, if none, do anon sign-in)
  let responseCookies: string[] = [];
  let cookieSessionData: { user?: { id?: string; is_anonymous?: boolean }; session?: { id?: string } } | null = null;
  let tokenSessionData: { user?: { id?: string; is_anonymous?: boolean }; session?: { id?: string } } | null = null;
  const requestedWidgetToken = extractWidgetTokenFromRequest(request);
  let validatedWidgetTokenSource: 'authorization' | 'query' | null = null;

  // First, check for a valid session via cookies
  try {
    const sessionController = new AbortController();
    const sessionTimer = setTimeout(() => sessionController.abort(), 5000);

    try {
      const sessionRes = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
        headers: upstreamHeaders,
        signal: sessionController.signal
      });
      if (sessionRes.ok) {
        cookieSessionData = await sessionRes.json().catch(() => null);
      } else if (sessionRes.status !== 401 && sessionRes.status !== 404) {
        const errorText = await sessionRes.text().catch(() => '');
        Logger.warn('[Bootstrap] Optional session check failed', {
          status: sessionRes.status,
          error: errorText
        });
      }
    } finally {
      clearTimeout(sessionTimer);
    }
  } catch (err) {
    Logger.warn('[Bootstrap] Session check error ignored', { error: err instanceof Error ? err.message : String(err) });
  }

  // Second, try to validate the widget token if provided
  if (requestedWidgetToken) {
    try {
      const validatedToken = await validateWidgetAuthToken(requestedWidgetToken.token, env);
      validatedWidgetTokenSource = requestedWidgetToken.tokenSource;
      tokenSessionData = {
        user: {
          id: validatedToken.userId,
          is_anonymous: true,
        },
        session: {
          id: validatedToken.sessionId,
        },
      };

      // IDENTITY RECONCILIATION:
      // If we have both, they MUST match. If they don't (e.g. cookie cleared but token remains),
      // we must trust the cookie/session state (which is the source of truth for the browser's
      // current identity) and discard the stale token.
      if (cookieSessionData?.user?.id && tokenSessionData?.user?.id && cookieSessionData.user.id !== tokenSessionData.user.id) {
        Logger.info('[Bootstrap] Identity mismatch detected; discarding stale widget token', {
          cookieUserId: cookieSessionData.user.id,
          tokenUserId: tokenSessionData.user.id
        });
        tokenSessionData = null;
      }
    } catch {
      // Invalid/expired widget token falls through
    }
  }

  // Final session selection: Prefer the recovered token session (if it matched or was standalone),
  // otherwise use the cookie session.
  let sessionData = tokenSessionData || cookieSessionData;

  // Typing session data for subsequent logic
  const typedSessionData = sessionData as { user?: { id?: string; is_anonymous?: boolean } } | null;


  if (!typedSessionData?.user) {
    try {
      // Need anonymous signin
      const anonHeaders = new Headers(upstreamHeaders);
      if (!anonHeaders.has('Content-Type')) {
        anonHeaders.set('Content-Type', 'application/json');
      }

      const anonController = new AbortController();
      const anonTimer = setTimeout(() => anonController.abort(), 5000);

      try {
        const anonRes = await fetch(`${env.BACKEND_API_URL}/api/auth/sign-in/anonymous`, {
          method: 'POST',
          headers: anonHeaders,
          body: '{}',
          signal: anonController.signal
        });
        if (!anonRes.ok) {
          const errorText = await anonRes.text().catch(() => '');
          if (anonRes.status === 429) {
            throw HttpErrors.tooManyRequests(
              `[Bootstrap] Anonymous sign-in failed: 429${errorText ? ` - ${errorText}` : ''}`
            );
          }
          throw HttpErrors.badGateway(
            `[Bootstrap] Anonymous sign-in failed: ${anonRes.status}${errorText ? ` - ${errorText}` : ''}`
          );
        }

        if (!anonRes.headers.getSetCookie) {
          throw new Error('[Bootstrap] Environment does not support getSetCookie(); cannot reliably extract Set-Cookie headers.');
        }
        const setCookieHeaders = anonRes.headers.getSetCookie();

        responseCookies = responseCookies.concat(setCookieHeaders);
        sessionData = await anonRes.json().catch(() => null);

        // After anonymous sign-in the upstream may return only a `user` object
        // and set a session cookie. Fetch the session wrapper using that
        // cookie so `session.id` is available to downstream logic.
        try {
          const cookieHeader = setCookieHeaders.map(c => c.split(';')[0]).join('; ');
          if (cookieHeader) {
            const followHeaders = Object.assign({}, upstreamHeaders);
            followHeaders['Cookie'] = cookieHeader;
            const followController = new AbortController();
            const followTimer = setTimeout(() => followController.abort(), 5000);
            try {
              const followRes = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
                headers: followHeaders,
                signal: followController.signal
              }).catch(() => null);
              if (followRes && followRes.ok) {
                const followed = await followRes.json().catch(() => null);
                if (followed) {
                  sessionData = followed;
                }
              }
            } finally {
              clearTimeout(followTimer);
            }
          }
        } catch (_e) {
          // If we fail to follow-up, keep the original anon payload (user only)
        }
      } finally {
        clearTimeout(anonTimer);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('[Bootstrap] Session operation timed out');
      }
      throw err;
    }
  }


  // 3. Wait for practice details
  const practiceDetails = await getPracticeDetails as Record<string, unknown>;
  const pd = practiceDetails as Record<string, unknown>;
  const practiceId =
    (typeof pd.organization_id === 'string' && pd.organization_id.trim()) || null;
  if (!practiceId) {
    throw HttpErrors.badGateway('Unable to resolve practice id from practice details');
  }

  // 4. Bootstrap an anon-safe active conversation so the widget can skip the extra
  // client-side get-or-create round-trip after bootstrap.
  let conversationId: string | null = null;
  let recentConversations: Array<{ id: string, created_at: string, last_message_at: string | null }> = [];
  const typedSessionDataResolved = sessionData as {
    user?: { id?: string; is_anonymous?: boolean };
    session?: { id?: string };
  } | null;
  const sessionUserId = typedSessionDataResolved?.user?.id ?? null;
  const sessionId =
    typeof typedSessionDataResolved?.session?.id === 'string' && typedSessionDataResolved.session.id.trim().length > 0
      ? typedSessionDataResolved.session.id.trim()
      : null;
  const isAnonymous = typedSessionDataResolved?.user?.is_anonymous === true;
  const widgetAuth =
    isAnonymous && sessionUserId && sessionId
      ? await issueWidgetAuthToken(
          env,
          { userId: sessionUserId, sessionId },
          validatedWidgetTokenSource
            ? { ttlSeconds: getWidgetTokenTtlForSource(validatedWidgetTokenSource) }
            : undefined
        )
      : null;
  const widgetQueryAuth =
    isAnonymous && sessionUserId && sessionId
      ? await issueWidgetAuthToken(
          env,
          { userId: sessionUserId, sessionId },
          { ttlSeconds: getWidgetTokenTtlForSource('query') }
        )
      : null;

  if (practiceId && sessionUserId) {
    try {
      const conversationService = new ConversationService(env);

      // Only fetch existing recent conversations; no more creation in bootstrap.
      // Filter for ('active', 'submitted') to avoid showing archived conversations in the widget.
      const userConversations = await conversationService.getConversations({
        practiceId,
        userId: sessionUserId,
        status: 'active',
        limit: 5
      });

      const mostRecent = userConversations[0] || null;
      conversationId = mostRecent?.id ?? null;

      recentConversations = userConversations.map(c => ({
        id: c.id,
        created_at: c.created_at,
        last_message_at: c.last_message_at ?? null
      }));
    } catch (err) {
      console.error('[Bootstrap] Failed to get conversations', { sessionUserId, practiceId, error: err });
    }
  }

  // 5. Resolve intake template
  // ------------------------------------------------------------------
  // Resolution rules (never hard-fail — always fall back to default):
  //   - no ?template param → default
  //   - param present → find slug match in settings.intakeTemplates
  //   - not found / broken config → default
  // ------------------------------------------------------------------
  let intakeTemplate: IntakeTemplate = DEFAULT_INTAKE_TEMPLATE;
  try {
    const dataSource = pd.metadata ?? pd.settings ?? pd.practice_settings;
    let templates: unknown[] = [];

    if (typeof dataSource === 'string') {
      const parsed = JSON.parse(dataSource) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const s = parsed as Record<string, unknown>;
        const rawTemplates = s.intakeTemplates;
        if (typeof rawTemplates === 'string') {
          try { templates = JSON.parse(rawTemplates) as unknown[]; } catch { /* ignore */ }
        } else if (Array.isArray(rawTemplates)) {
          templates = rawTemplates;
        }
      }
    } else if (dataSource && typeof dataSource === 'object' && !Array.isArray(dataSource)) {
      const s = dataSource as Record<string, unknown>;
      const rawTemplates = s.intakeTemplates;
      if (typeof rawTemplates === 'string') {
        try { templates = JSON.parse(rawTemplates) as unknown[]; } catch { /* ignore */ }
      } else if (Array.isArray(rawTemplates)) {
        templates = rawTemplates;
      }
    }

    const resolvedSlug = templateSlugParam ?? DEFAULT_INTAKE_TEMPLATE.slug;
    const match = templates.find(
      (t): t is IntakeTemplate =>
        !!t && typeof t === 'object' && (t as Record<string, unknown>).slug === resolvedSlug
        && Array.isArray((t as Record<string, unknown>).fields)
        && ((t as Record<string, unknown>).fields as unknown[]).length > 0,
    ) ?? null;

    if (match) {
      intakeTemplate = match;
    }
  } catch {
    // Malformed settings JSON — fall back to default (already set)
  }

  // Create the response object
  const bootstrapResponse = {
    practiceId,
    practiceDetails,
    session: sessionData,
    conversationId: conversationId,
    conversations: recentConversations,
    widgetAuthToken: widgetAuth?.token ?? null,
    widgetAuthTokenExpiresAt: widgetAuth?.expiresAt ?? null,
    widgetQueryAuthToken: widgetQueryAuth?.token ?? null,
    widgetQueryAuthTokenExpiresAt: widgetQueryAuth?.expiresAt ?? null,
    intakeTemplate,
  };

  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });

  // Forward Set-Cookie headers properly, handling multiple values
  // Since Headers class overwrites on set(), we use append() which handles multiple Set-Cookie properly in Cloudflare Workers
  for (const cookie of responseCookies) {
    responseHeaders.append('Set-Cookie', normalizeCrossSiteWidgetCookie(cookie, request));
  }

  return new Response(JSON.stringify(bootstrapResponse), {
    status: 200,
    headers: responseHeaders
  });
}
