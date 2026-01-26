import type { Request as WorkerRequest } from '@cloudflare/workers-types';
import type { Env } from '../types';
import { HttpErrors } from '../errorHandler';
import { requirePracticeMember } from '../middleware/auth';

const STATUS_SUFFIX = 'status';
const WS_SUFFIX = 'ws';

const getRouteParts = (pathname: string): { practiceId: string; matterId: string; action: string } | null => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 5) {
    return null;
  }
  if (parts[0] !== 'api' || parts[1] !== 'paralegal') {
    return null;
  }
  let practiceId: string;
  let matterId: string;
  try {
    practiceId = decodeURIComponent(parts[2]);
    matterId = decodeURIComponent(parts[3]);
  } catch {
    return null;
  }
  const action = parts[4];
  if (!practiceId || !matterId || !action) {
    return null;
  }
  return { practiceId, matterId, action };
};

export async function handleParalegal(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = getRouteParts(url.pathname);
  if (!route) {
    throw HttpErrors.notFound('Paralegal route not found');
  }

  const { practiceId, matterId, action } = route;
  await requirePracticeMember(request, env, practiceId, 'paralegal');

  const id = env.MATTER_PROGRESS.idFromName(`${practiceId}:${matterId}`);
  const stub = env.MATTER_PROGRESS.get(id);

  if (action === STATUS_SUFFIX) {
    const forwardUrl = new URL(request.url);
    forwardUrl.pathname = '/internal/status';
    const forwardRequest = new Request(forwardUrl.toString(), request);
    return stub.fetch(forwardRequest as unknown as WorkerRequest) as unknown as Response;
  }

  if (action === WS_SUFFIX) {
    const forwardUrl = new URL(request.url);
    forwardUrl.pathname = '/internal/ws';
    const forwardRequest = new Request(forwardUrl.toString(), request);
    return stub.fetch(forwardRequest as unknown as WorkerRequest) as unknown as Response;
  }

  throw HttpErrors.notFound('Paralegal endpoint not found');
}
