import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { NotificationDestinationStore } from '../services/NotificationDestinationStore.js';
import { NotificationStore } from '../services/NotificationStore.js';
import { OneSignalService } from '../services/OneSignalService.js';

export async function handleNotifications(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/notifications/ws' && request.method === 'GET') {
    const auth = await requireAuth(request, env);
    const id = env.NOTIFICATION_HUB.idFromName(auth.user.id);
    const stub = env.NOTIFICATION_HUB.get(id);
    const wsUrl = new URL(request.url);
    wsUrl.pathname = '/ws';
    const wsRequest = new Request(wsUrl.toString(), request);
    return stub.fetch(wsRequest as unknown as WorkerRequest) as unknown as Response;
  }

  if (path === '/api/notifications/ws') {
    throw HttpErrors.methodNotAllowed('Unsupported method for notifications WS endpoint');
  }

  if (path === '/api/notifications/destinations' && request.method === 'POST') {
    const auth = await requireAuth(request, env);
    const payload = await request.json().catch(() => null) as {
      onesignalId?: string;
      platform?: string;
    } | null;

    if (!payload?.onesignalId || !payload.platform) {
      throw HttpErrors.badRequest('OneSignal destination data is required');
    }

    const oneSignal = OneSignalService.isConfigured(env) ? new OneSignalService(env) : null;
    if (!oneSignal) {
      throw HttpErrors.serviceUnavailable('OneSignal is not configured');
    }

    const destinationStore = new NotificationDestinationStore(env);
    await oneSignal.setExternalUserId(payload.onesignalId, auth.user.id);
    await destinationStore.upsertDestination({
      userId: auth.user.id,
      onesignalId: payload.onesignalId,
      platform: payload.platform,
      externalUserId: auth.user.id,
      userAgent: request.headers.get('user-agent')
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (path === '/api/notifications/unread-count' && request.method === 'GET') {
    const auth = await requireAuth(request, env);
    const store = new NotificationStore(env);
    const category = url.searchParams.get('category');
    const count = await store.getUnreadCount(auth.user.id, category);

    return new Response(JSON.stringify({ success: true, data: { count } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (path === '/api/notifications' && request.method === 'GET') {
    const auth = await requireAuth(request, env);
    const store = new NotificationStore(env);

    if (url.searchParams.has('unread')) {
      throw HttpErrors.badRequest('unread is not supported; use unreadOnly');
    }

    const result = await store.listNotifications({
      userId: auth.user.id,
      category: url.searchParams.get('category'),
      limit: url.searchParams.get('limit'),
      cursor: url.searchParams.get('cursor'),
      unreadOnly: url.searchParams.get('unreadOnly') === 'true' || url.searchParams.get('unreadOnly') === '1'
    });

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (path === '/api/notifications/read-all' && request.method === 'POST') {
    const auth = await requireAuth(request, env);
    const store = new NotificationStore(env);
    const category = url.searchParams.get('category');
    const updated = await store.markAllRead(auth.user.id, category);

    return new Response(JSON.stringify({ success: true, data: { updated } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (path.startsWith('/api/notifications/') && request.method === 'POST' && path.endsWith('/unread')) {
    const auth = await requireAuth(request, env);
    const store = new NotificationStore(env);
    const parts = path.split('/');
    if (parts.length !== 5) {
      throw HttpErrors.notFound('Notification endpoint not found');
    }
    const notificationId = parts[3];
    if (!notificationId) {
      throw HttpErrors.badRequest('Notification ID is required');
    }

    const updated = await store.markUnread(auth.user.id, notificationId);

    return new Response(JSON.stringify({ success: true, data: { updated } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (path.startsWith('/api/notifications/') && request.method === 'POST' && path.endsWith('/read')) {
    const auth = await requireAuth(request, env);
    const store = new NotificationStore(env);
    const parts = path.split('/');
    if (parts.length !== 5) {
      throw HttpErrors.notFound('Notification endpoint not found');
    }
    const notificationId = parts[3];
    if (!notificationId) {
      throw HttpErrors.badRequest('Notification ID is required');
    }

    const updated = await store.markRead(auth.user.id, notificationId);

    return new Response(JSON.stringify({ success: true, data: { updated } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  throw HttpErrors.notFound('Notification endpoint not found');
}
