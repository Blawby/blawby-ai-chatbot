import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { NotificationDestinationStore } from '../services/NotificationDestinationStore.js';
import { OneSignalService } from '../services/OneSignalService.js';

export async function handleNotifications(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

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

  if (path.startsWith('/api/notifications/destinations/') && request.method === 'DELETE') {
    const auth = await requireAuth(request, env);
    const parts = path.split('/');
    if (parts.length !== 5) {
      throw HttpErrors.notFound('Notification endpoint not found');
    }
    const onesignalId = parts[4];
    if (!onesignalId) {
      throw HttpErrors.badRequest('OneSignal destination id is required');
    }

    const destinationStore = new NotificationDestinationStore(env);
    const disabled = await destinationStore.disableDestination(onesignalId, auth.user.id);

    return new Response(JSON.stringify({ success: true, data: { disabled } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  throw HttpErrors.notFound('Notification endpoint not found');
}
