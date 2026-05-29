import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxy } from '../../../../worker/utils/proxy.js';
import type { Env } from '../../../../worker/types.js';

/**
 * Proxy header-forwarding tests (U12). The plan asks us to confirm
 * `Idempotency-Key` is forwarded on outbound requests — proxy.ts
 * copies all incoming headers, but a regression test locks that
 * behavior in case header normalization is ever added.
 */

const buildEnv = (): Env =>
  ({
    NODE_ENV: 'test',
    BACKEND_API_URL: 'https://backend.test',
    IDEMPOTENCY_SALT: 'test-salt',
  } as Env);

const buildRequest = (
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Request =>
  new Request(`https://worker.test${path}`, {
    method,
    headers,
    body,
  });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('proxy() — header forwarding', () => {
  it('forwards Idempotency-Key on outbound requests verbatim', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const idemKey = 'abcd'.repeat(16); // 64-char synthetic key
    await proxy(
      buildRequest(
        'POST',
        '/api/matters/mat_01/notes',
        {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          'X-Mcp-Practice-Id': 'practice-1',
        },
        '{"body":"note"}',
      ),
      buildEnv(),
      { label: 'test-proxy' },
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Idempotency-Key')).toBe(idemKey);
    expect(headers.get('X-Mcp-Practice-Id')).toBe('practice-1');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('forwards Authorization header verbatim (covers the MCP service token path)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    await proxy(
      buildRequest('GET', '/api/matters', {
        Authorization: 'Bearer svc-token',
      }),
      buildEnv(),
      { label: 'test-proxy' },
    );
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer svc-token');
  });

  it('forwards X-Mcp-* identity headers verbatim', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    await proxy(
      buildRequest('GET', '/api/matters', {
        'X-Mcp-Practice-Id': 'practice-1',
        'X-Mcp-User-Id': 'user-1',
        'X-Mcp-Jti': 'jti-1',
        'X-Mcp-Scopes': 'matters:read,events:subscribe',
      }),
      buildEnv(),
      { label: 'test-proxy' },
    );
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('X-Mcp-Practice-Id')).toBe('practice-1');
    expect(headers.get('X-Mcp-User-Id')).toBe('user-1');
    expect(headers.get('X-Mcp-Jti')).toBe('jti-1');
    expect(headers.get('X-Mcp-Scopes')).toBe('matters:read,events:subscribe');
  });

  it('forwards the body byte-identical on POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    const requestBody = '{"matter_id":"mat_01","body":"Reviewed retainer"}';
    await proxy(
      buildRequest(
        'POST',
        '/api/matters/mat_01/notes',
        { 'Content-Type': 'application/json' },
        requestBody,
      ),
      buildEnv(),
      { label: 'test-proxy' },
    );
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(ArrayBuffer);
    const decoded = new TextDecoder().decode(init.body as ArrayBuffer);
    expect(decoded).toBe(requestBody);
  });
});
