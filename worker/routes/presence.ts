import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { optionalAuth } from '../middleware/auth.js';

/**
 * GET /api/presence/:practiceId/ws
 *
 * Upgrades to a WebSocket connection on the practice's PresenceRoom DO. The
 * caller's authenticated userId is forwarded as a query string parameter so
 * the DO can tag the socket without re-running auth on the inside.
 *
 * Anonymous users get rejected — only authenticated members track presence.
 * The DO itself is hibernation-safe and broadcasts a `{type:'presence',
 * online:string[]}` snapshot on every connect/disconnect.
 *
 * Note: lives under /api/presence/, not /api/practice/presence/, because
 * /api/practice/* is owned by the backend proxy (matchesBackendProxy in
 * worker/index.ts).
 */
export async function handlePresence(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // Expected: ['api', 'presence', ':practiceId', 'ws']
  if (segments.length !== 4 || segments[0] !== 'api' || segments[1] !== 'presence' || segments[3] !== 'ws') {
    throw HttpErrors.notFound('Presence route not found');
  }
  const practiceId = segments[2]; // segments.length !== 4 guard above ensures this is always present

  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    throw HttpErrors.badRequest('expected websocket upgrade');
  }

  const auth = await optionalAuth(request, env);
  if (!auth || auth.isAnonymous) {
    throw HttpErrors.unauthorized('Authentication required for presence');
  }
  const userId = auth.user.id;

  // Membership/authorization check: user must be a member of the practice
  const members = await env.RemoteApiService.getPracticeMembers(env, practiceId, request);
  const isMember = Array.isArray(members) && members.some(m => m.user_id === userId);
  if (!isMember) {
    throw HttpErrors.forbidden('Not authorized for this practice');
  }

  const id = env.PRESENCE_ROOM.idFromName(practiceId);
  const stub = env.PRESENCE_ROOM.get(id);

  // Forward to the DO with userId as a query param so it can tag the socket
  // and survive hibernation lookups.
  const presenceUrl = new URL(request.url);
  presenceUrl.searchParams.set('userId', userId);
  const forwarded = new Request(presenceUrl.toString(), {
    method: request.method,
    headers: request.headers,
    cf: request.cf,
  });
  return stub.fetch(forwarded as unknown as WorkerRequest) as unknown as Response;
}
