import type { Env } from '../types';

/**
 * Fallback handler for non-API routes.
 *
 * In development (`dev:worker` on :8787 in isolation), this returns a minimal
 * health-check response so you know the worker is running.
 *
 * In production, Cloudflare Pages serves index.html for all non-asset routes
 * via the SPA catch-all in public/_redirects — so this handler is never reached
 * by end users. It exists only as a safety net.
 */
export async function handleRoot(_request: Request, _env: Env): Promise<Response> {
  return new Response(JSON.stringify({
    ok: true,
    service: 'blawby-ai-chatbot',
    hint: 'The frontend SPA is served by Cloudflare Pages, not this worker.'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
