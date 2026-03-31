import type { Env } from '../types.js';
import { HttpErrors, createSuccessResponse } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

export async function handlePracticeTeam(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 4 || segments[0] !== 'api' || segments[1] !== 'practice' || segments[3] !== 'team') {
    throw HttpErrors.notFound('Endpoint not found');
  }

  let practiceId = '';
  try {
    practiceId = decodeURIComponent(segments[2] ?? '');
  } catch {
    throw HttpErrors.badRequest('Invalid practice id encoding');
  }

  if (!practiceId) {
    throw HttpErrors.badRequest('practice id is required');
  }

  const team = await RemoteApiService.getPracticeTeam(env, practiceId, request);
  return createSuccessResponse(team);
}
