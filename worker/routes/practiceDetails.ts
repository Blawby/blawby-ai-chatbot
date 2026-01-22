import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

export async function handlePracticeDetails(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const prefix = '/api/practice/details/';
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

  const response = await RemoteApiService.getPublicPracticeDetails(env, decodedSlug, request);
  const rawText = await response.text();

  const normalizedHeaders = new Headers(response.headers);
  normalizedHeaders.delete('content-encoding');
  normalizedHeaders.delete('content-length');

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return new Response(rawText, {
      status: response.status,
      headers: normalizedHeaders
    });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return new Response(rawText, {
      status: response.status,
      headers: normalizedHeaders
    });
  }

  if (!('practiceId' in payload) && !('practice_id' in payload)) {
    try {
      const intakeSettings = await RemoteApiService.getPracticeClientIntakeSettings(env, decodedSlug, request);
      const practiceId = intakeSettings?.organization?.id;
      if (practiceId) {
        payload.practiceId = practiceId;
      }
    } catch (error) {
      console.warn('[PracticeDetails] Failed to fetch intake settings for slug', {
        slug: decodedSlug,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  normalizedHeaders.set('content-type', 'application/json');

  return new Response(JSON.stringify(payload), {
    status: response.status,
    headers: normalizedHeaders
  });
}
