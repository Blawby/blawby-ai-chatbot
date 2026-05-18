import type { Env } from '../types';
import { createSuccessResponse } from '../errorHandler';

export async function handleMetricsVitals(request: Request, _env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // TODO(metrics): forward to analytics backend (e.g., ClickHouse, Axiom)
  return createSuccessResponse({ received: true });
}
