import { describe, expect, it, vi } from 'vitest';
import { productionChecks, runProductionHealthChecks } from '../../../scripts/lib/productionHealth.js';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

describe('production health checks', () => {
  it('covers the public frontend, Worker, backend database, auth, AI route, and billing route', () => {
    expect(productionChecks.map((check) => check.name)).toEqual([
      'frontend',
      'worker',
      'backend_database',
      'auth_bootstrap',
      'ai_route',
      'billing_route',
    ]);
  });

  it('accepts healthy contracts without reading response bodies into evidence', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith('/api/health') && target.startsWith('https://ai.')) {
        return json({
          success: true,
          data: {
            status: 'ok',
            environment: 'production',
            release: { commit: 'sha', workerVersionId: 'worker-id' },
          },
          private_field: 'do-not-record',
        });
      }
      if (target.startsWith('https://api.')) {
        return json({
          status: 'ok',
          database: { status: 'connected' },
          private_field: 'do-not-record',
        });
      }
      if (target.endsWith('/api/auth/get-session')) return json(null);
      if (target.includes('/api/ai/') || target.endsWith('/api/subscriptions')) return json({}, 401);
      return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;

    const results = await runProductionHealthChecks({ fetchImpl, attempts: 1, retryDelayMs: 0 });
    expect(results).toHaveLength(6);
    expect(results.every((result) => result.outcome === 'healthy')).toBe(true);
    expect(results.find((result) => result.name === 'worker')?.release).toEqual({
      commit: 'sha',
      deploymentId: 'worker-id',
    });
    expect(results.find((result) => result.name === 'backend_database')?.release).toBeUndefined();
    expect(JSON.stringify(results)).not.toContain('do-not-record');
  });

  it('retries boundedly and reports only a safe failure class', async () => {
    const fetchImpl = vi.fn(async () => new Response('private upstream detail', { status: 503 })) as unknown as typeof fetch;
    const results = await runProductionHealthChecks({ fetchImpl, attempts: 2, retryDelayMs: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(productionChecks.length * 2);
    expect(results.every((result) => result.outcome === 'failed')).toBe(true);
    expect(results.every((result) => result.failureClass === 'http_status')).toBe(true);
    expect(JSON.stringify(results)).not.toContain('private upstream detail');
  });

  it('still rejects a backend health response without a connected database', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.startsWith('https://api.')) {
        return json({ status: 'ok', database: { status: 'disconnected' } });
      }
      if (target.endsWith('/api/health')) {
        return json({
          success: true,
          data: {
            status: 'ok',
            environment: 'production',
            release: { commit: 'sha', workerVersionId: 'worker-id' },
          },
        });
      }
      if (target.endsWith('/api/auth/get-session')) return json(null);
      if (target.includes('/api/ai/') || target.endsWith('/api/subscriptions')) return json({}, 401);
      return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;

    const results = await runProductionHealthChecks({ fetchImpl, attempts: 1, retryDelayMs: 0 });
    expect(results.find((result) => result.name === 'backend_database')).toMatchObject({
      outcome: 'failed',
      failureClass: 'contract',
    });
  });
});
