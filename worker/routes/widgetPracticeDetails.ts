import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';

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

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    }
  });
}
