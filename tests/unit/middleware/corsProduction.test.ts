import { describe, expect, it } from 'vitest';
import { getCorsConfig, withCORS } from '../../../worker/middleware/cors.js';
import type { Env } from '../../../worker/types.js';

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

describe('production response security', () => {
  const env = {
    NODE_ENV: 'production',
    ALLOWED_WS_ORIGINS: 'https://ai.blawby.com,https://blawby.com,https://www.blawby.com',
  } as Env;
  const handler = withCORS(async () => Response.json({ ok: true }), getCorsConfig);

  it('permits the configured production origin and emits the complete security header set', async () => {
    const response = await handler(new Request('https://ai.blawby.com/api/health', {
      headers: { Origin: 'https://ai.blawby.com' },
    }), env, ctx);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ai.blawby.com');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.get('Strict-Transport-Security')).toContain('includeSubDomains');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
  });

  it('does not grant CORS to staging or localhost origins in production', async () => {
    for (const origin of ['https://ai-staging.blawby.com', 'http://localhost:5173']) {
      const response = await handler(new Request('https://ai.blawby.com/api/health', {
        headers: { Origin: origin },
      }), env, ctx);
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    }
  });

  it('fails closed when the production origin allowlist is absent', () => {
    expect(getCorsConfig({ NODE_ENV: 'production' } as Env).allowedOrigins).toEqual([]);
  });
});
