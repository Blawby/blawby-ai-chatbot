import type { Env } from '../types';
import { createSuccessResponse } from '../errorHandler';

export async function handleConfig(request: Request, env: Env): Promise<Response> {
  const _url = new URL(request.url);
  
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Only expose non-sensitive configuration to frontend
    const config = {
      features: {
        emailVerification: env.REQUIRE_EMAIL_VERIFICATION === 'true'
      }
    };

    // Static-ish config — safe to cache briefly in the browser.
    const response = createSuccessResponse(config);
    response.headers.set('Cache-Control', 'public, max-age=300');
    return response;
  } catch (error) {
    console.error('Error getting configuration:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
