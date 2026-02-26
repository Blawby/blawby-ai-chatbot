import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { ConversationService } from '../services/ConversationService.js';

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

  try {
    const sessionController = new AbortController();
    const sessionTimer = setTimeout(() => sessionController.abort(), 5000);

    try {
      const sessionRes = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
        headers: upstreamHeaders,
        signal: sessionController.signal
      });
      sessionData = await sessionRes.json().catch(() => null);
    } finally {
      clearTimeout(sessionTimer);
    }

    // Typing session data
    const typedSessionData = sessionData as { user?: { isAnonymous?: boolean } } | null;

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
          throw new Error(`[Bootstrap] Anonymous sign-in failed: ${anonRes.status}`);
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

  // 3. Wait for practice details
  const practiceDetails = await getPracticeDetails as {
    data?: { id?: string };
    id?: string;
    practiceId?: string;
    organization_id?: string;
    organizationId?: string;
  };
  const practiceId = 'practiceId' in practiceDetails && typeof practiceDetails.practiceId === 'string'
      ? practiceDetails.practiceId 
      : 'data' in practiceDetails && typeof practiceDetails.data === 'object' && practiceDetails.data && 'id' in practiceDetails.data && typeof practiceDetails.data.id === 'string'
        ? practiceDetails.data.id
        : 'id' in practiceDetails && typeof practiceDetails.id === 'string'
          ? practiceDetails.id
          : 'organization_id' in practiceDetails && typeof practiceDetails.organization_id === 'string'
            ? practiceDetails.organization_id
            : 'organizationId' in practiceDetails && typeof practiceDetails.organizationId === 'string'
              ? practiceDetails.organizationId
          : null;

  // 4. Bootstrap an anon-safe active conversation so the widget can skip the extra
  // client-side get-or-create round-trip after bootstrap.
  let conversationId: string | null = null;
  const conversationsData: { data?: Array<{ id: string, created_at: string, last_message_at: string }> } | null = null;
  const typedSessionData = sessionData as { user?: { id?: string; isAnonymous?: boolean } } | null;
  const sessionUserId = typedSessionData?.user?.id ?? null;
  const isAnonymous = typedSessionData?.user?.isAnonymous === true;

  if (practiceId && sessionUserId) {
    const conversationService = new ConversationService(env);
    const conversation = await conversationService.getOrCreateCurrentConversation(
      sessionUserId,
      practiceId,
      request,
      isAnonymous,
      { skipPracticeValidation: true }
    );
    conversationId = conversation.id;
  }

  // Create the response object
  const bootstrapResponse = {
    practiceId,
    practiceDetails,
    session: sessionData,
    conversationId: conversationId,
    conversations: conversationsData?.data || []
  };

  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });

  // Forward Set-Cookie headers properly, handling multiple values
  // Since Headers class overwrites on set(), we use append() which handles multiple Set-Cookie properly in Cloudflare Workers
  for (const cookie of responseCookies) {
    responseHeaders.append('Set-Cookie', cookie);
  }

  return new Response(JSON.stringify(bootstrapResponse), {
    status: 200,
    headers: responseHeaders
  });
}
