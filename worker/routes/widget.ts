import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

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
  const getPracticeDetails = RemoteApiService.getPublicPracticeDetails(env, slug, request).then(async (res) => {
    if (!res.ok) throw new Error(`[Bootstrap] Error fetching practice details: ${res.status}`);
    return await res.json();
  }).catch((err) => {
    console.error(err);
    throw HttpErrors.notFound('Practice not found');
  });

  // 2. Manage Session (Check session, if none, do anon sign-in)
  let sessionCookie: string | null = incomingCookie;
  let responseCookies: string[] = [];
  let sessionData: unknown = null;

  try {
    const sessionRes = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
      headers: upstreamHeaders
    });
    sessionData = await sessionRes.json().catch(() => null);

    // Typing session data
    const typedSessionData = sessionData as { user?: { isAnonymous?: boolean } } | null;

    if (!typedSessionData?.user) {
      // Need anonymous signin
      const anonHeaders = new Headers(upstreamHeaders);
      if (!anonHeaders.has('Content-Type')) {
        anonHeaders.set('Content-Type', 'application/json');
      }
      const anonRes = await fetch(`${env.BACKEND_API_URL}/api/auth/sign-in/anonymous`, {
        method: 'POST',
        headers: anonHeaders,
        body: '{}'
      });
      if (!anonRes.ok) {
        throw new Error(`[Bootstrap] Anonymous sign-in failed: ${anonRes.status}`);
      }
      
      const setCookieHeaders = anonRes.headers.getSetCookie 
        ? anonRes.headers.getSetCookie() 
        : (anonRes.headers.get('set-cookie') ? [anonRes.headers.get('set-cookie') as string] : []);
      
      responseCookies = responseCookies.concat(setCookieHeaders);
      
      // Update our sessionCookie for subsequent requests
      const newCookies = setCookieHeaders.map(c => c.split(';')[0]).join('; ');
      sessionCookie = incomingCookie ? `${incomingCookie}; ${newCookies}` : newCookies;
      
      sessionData = await anonRes.json().catch(() => null);
    }
  } catch (err) {
    console.error('[Bootstrap] Session fetch error:', err);
    // Don't fail the whole bootstrap, just return no session so client can retry natively
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

  // 4. Fetch the most recent conversation if we have a session
  let conversationId: string | null = null;
  let conversationsData: { data?: Array<{ id: string, created_at: string, last_message_at: string }> } | null = null;

  if (sessionCookie && practiceId) {
    const nextHeaders = new Headers();
    nextHeaders.set('Cookie', sessionCookie);
    nextHeaders.set('Content-Type', 'application/json');

    try {
      // Get conversations using the authenticated cookie
      const convsRes = await fetch(`${env.BACKEND_API_URL}/api/practice/${practiceId}/conversations?scope=practice`, {
        headers: nextHeaders
      });
      
      if (convsRes.ok) {
        conversationsData = await convsRes.json().catch(() => null) as { data?: Array<{ id: string, created_at: string, last_message_at: string }> } | null;
      }
    } catch (err) {
      console.error('[Bootstrap] Error fetching conversations:', err);
    }

    if (conversationsData?.data && Array.isArray(conversationsData.data) && conversationsData.data.length > 0) {
      // Find the most recent conversation
        const sorted = [...conversationsData.data].sort((a, b) => {
          const aTime = new Date(a.last_message_at ?? a.created_at).getTime() || 0;
          const bTime = new Date(b.last_message_at ?? b.created_at).getTime() || 0;
          return bTime - aTime;
        });
        conversationId = sorted[0].id;
    }
    
    // Auto-create conversation if none exist
    if (!conversationId) {
      try {
        const createRes = await fetch(`${env.BACKEND_API_URL}/api/conversations?practiceId=${practiceId}`, {
          method: 'POST',
          headers: nextHeaders,
        });
        if (createRes.ok) {
            const createData = await createRes.json().catch(() => null) as { success: boolean, data?: { id: string } } | null;
            if (createData?.success && createData.data?.id) {
                conversationId = createData.data.id;
                
                // Immediately enqueue a system message task if needed, or trigger it right here
                // We'll leave it to the client for now unless it's strictly necessary to do server-side
            }
        }
      } catch (err) {
        console.error('[Bootstrap] Error creating conversation:', err);
      }
    }
  }

  // Create the response object
  const bootstrapResponse = {
    practiceDetails,
    session: sessionData,
    conversationId: conversationId,
    conversations: conversationsData?.data || []
  };

  const responseHeaders = new Headers({
    'Content-Type': 'application/json'
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
