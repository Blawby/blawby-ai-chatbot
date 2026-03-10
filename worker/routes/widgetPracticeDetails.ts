import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

export async function handleWidgetPracticeDetails(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const prefix = '/api/widget/practice-details/';
  if (!url.pathname.startsWith(prefix)) {
    throw HttpErrors.notFound('Endpoint not found');
  }

  const slug = url.pathname.slice(prefix.length);
  if (!slug) {
    throw HttpErrors.badRequest('practice slug is required');
  }

  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    throw HttpErrors.badRequest('Invalid slug encoding');
  }

  const remoteResponse = await RemoteApiService.getPublicPracticeDetails(env, decodedSlug, request);
  if (!remoteResponse.ok) {
    const errorBody = await remoteResponse.text().catch(() => '');
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });

    const contentType = remoteResponse.headers.get('Content-Type') || '';
    if (contentType) {
      headers.set('Content-Type', contentType);
    } else {
      headers.set('Content-Type', 'application/json');
    }

    return new Response(errorBody || JSON.stringify({ error: remoteResponse.statusText || 'Upstream request failed' }), {
      status: remoteResponse.status,
      statusText: remoteResponse.statusText,
      headers,
    });
  }

  const payload = await remoteResponse.json().catch(() => null) as Record<string, unknown> | null;

  const dataRecord =
    payload && typeof payload.data === 'object' && payload.data !== null
      ? payload.data as Record<string, unknown>
      : null;
  const detailsRecord =
    payload && typeof payload.details === 'object' && payload.details !== null
      ? payload.details as Record<string, unknown>
      : null;
  const nestedDetailsRecord =
    dataRecord && typeof dataRecord.details === 'object' && dataRecord.details !== null
      ? dataRecord.details as Record<string, unknown>
      : null;

  const accentColor =
    (payload && typeof payload.accentColor === 'string' && payload.accentColor.trim()) ||
    (payload && typeof payload.accent_color === 'string' && payload.accent_color.trim()) ||
    (dataRecord && typeof dataRecord.accentColor === 'string' && dataRecord.accentColor.trim()) ||
    (dataRecord && typeof dataRecord.accent_color === 'string' && dataRecord.accent_color.trim()) ||
    (detailsRecord && typeof detailsRecord.accentColor === 'string' && detailsRecord.accentColor.trim()) ||
    (detailsRecord && typeof detailsRecord.accent_color === 'string' && detailsRecord.accent_color.trim()) ||
    (nestedDetailsRecord && typeof nestedDetailsRecord.accentColor === 'string' && nestedDetailsRecord.accentColor.trim()) ||
    (nestedDetailsRecord && typeof nestedDetailsRecord.accent_color === 'string' && nestedDetailsRecord.accent_color.trim()) ||
    null;

  return new Response(JSON.stringify({ accentColor, accent_color: accentColor }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    }
  });
}
