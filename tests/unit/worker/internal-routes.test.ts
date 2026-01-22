import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';

let handleRequest: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const env = { NODE_ENV: 'test' } as Env;
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

beforeAll(async () => {
  ({ handleRequest } = await import('../../../worker/index.js'));
});

describe('worker routing', () => {
  it('returns 404 for /internal/message', async () => {
    const request = new Request('https://example.com/internal/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await handleRequest(request, env, ctx);
    const payload = await response.json() as { errorCode?: string };

    expect(response.status).toBe(404);
    expect(payload.errorCode).toBe('HTTP_404');
  });

  it('returns 404 for /internal/membership-revoked', async () => {
    const request = new Request('https://example.com/internal/membership-revoked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await handleRequest(request, env, ctx);
    const payload = await response.json() as { errorCode?: string };

    expect(response.status).toBe(404);
    expect(payload.errorCode).toBe('HTTP_404');
  });
});
