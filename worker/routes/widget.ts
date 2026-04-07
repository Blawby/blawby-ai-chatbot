import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { ConversationService } from '../services/ConversationService.js';
import {
  extractWidgetTokenFromRequest,
  getWidgetTokenTtlForSource,
  issueWidgetAuthToken,
  validateWidgetAuthToken
} from '../utils/widgetAuthToken.js';

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
  let sessionData: unknown = null;
  const requestedWidgetToken = extractWidgetTokenFromRequest(request);
  let validatedWidgetTokenSource: 'authorization' | 'query' | null = null;

  if (requestedWidgetToken) {
    try {
      const validatedToken = await validateWidgetAuthToken(requestedWidgetToken.token, env);
      validatedWidgetTokenSource = requestedWidgetToken.tokenSource;
      sessionData = {
        id: validatedToken.sessionId,
        user: {
          id: validatedToken.userId,
          isAnonymous: true,
          is_anonymous: true,
        },
        session: {
          id: validatedToken.sessionId,
        },
      };
    } catch {
      // Invalid/expired widget token should not fail bootstrap; fall back to
      // cookie/anonymous session bootstrap flow.
    }
  }

  if (!sessionData) {
    try {
      const sessionController = new AbortController();
      const sessionTimer = setTimeout(() => sessionController.abort(), 5000);

      try {
        const sessionRes = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
          headers: upstreamHeaders,
          signal: sessionController.signal
        });
        if (sessionRes.ok) {
          sessionData = await sessionRes.json().catch(() => null);
        } else if (sessionRes.status === 401 || sessionRes.status === 404) {
          sessionData = null;
        } else {
          const errorText = await sessionRes.text().catch(() => '');
          throw HttpErrors.badGateway(
            `[Bootstrap] Session check failed: ${sessionRes.status}${errorText ? ` - ${errorText}` : ''}`
          );
        }
      } finally {
        clearTimeout(sessionTimer);
      }

      // Typing session data
      const typedSessionData = sessionData as { user?: { id?: string; isAnonymous?: boolean } } | null;

      if (!typedSessionData?.user) {
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
          
          const setCookieHeaders = anonRes.headers.getSetCookie 
            ? anonRes.headers.getSetCookie() 
            : (anonRes.headers.get('set-cookie') ? [anonRes.headers.get('set-cookie') as string] : []);
          
          responseCookies = responseCookies.concat(setCookieHeaders);
          sessionData = await anonRes.json().catch(() => null);
        } finally {
          clearTimeout(anonTimer);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('[Bootstrap] Session operation timed out');
      }
      throw err;
    }
  }

  // 3. Wait for practice details
  const practiceDetails = await getPracticeDetails as {
    data?: { id?: string };
    id?: string;
    practiceId?: string;
  };
  const practiceId = 'practiceId' in practiceDetails && typeof practiceDetails.practiceId === 'string'
      ? practiceDetails.practiceId 
      : 'data' in practiceDetails && typeof practiceDetails.data === 'object' && practiceDetails.data && 'id' in practiceDetails.data && typeof practiceDetails.data.id === 'string'
        ? practiceDetails.data.id
        : 'id' in practiceDetails && typeof practiceDetails.id === 'string'
          ? practiceDetails.id
          : null;
  if (!practiceId) {
    throw HttpErrors.badGateway('Unable to resolve practice id from practice details');
  }

  // 4. Bootstrap an anon-safe active conversation so the widget can skip the extra
  // client-side get-or-create round-trip after bootstrap.
  let conversationId: string | null = null;
  let recentConversations: Array<{ id: string, created_at: string, last_message_at: string | null }> = [];
  const typedSessionDataResolved = sessionData as {
    user?: { id?: string; isAnonymous?: boolean; is_anonymous?: boolean };
    session?: { id?: string };
  } | null;
  const sessionUserId = typedSessionDataResolved?.user?.id ?? null;
  const sessionId =
    typeof typedSessionDataResolved?.session?.id === 'string' && typedSessionDataResolved.session.id.trim().length > 0
      ? typedSessionDataResolved.session.id.trim()
      : sessionUserId;
  const isAnonymous =
    typedSessionDataResolved?.user?.isAnonymous === true ||
    typedSessionDataResolved?.user?.is_anonymous === true;
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
        status: ['active', 'submitted'],
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
    widgetQueryAuthTokenExpiresAt: widgetQueryAuth?.expiresAt ?? null
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
