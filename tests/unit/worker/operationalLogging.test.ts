import { afterEach, describe, expect, it, vi } from 'vitest';
import { failureClass, logOperationalEvent, routeFamily } from '../../../worker/utils/operationalLogging.js';

describe('operational logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reduces request paths to non-identifying route families', () => {
    expect(routeFamily('/api/matters/matter-123/private')).toBe('/api/matters');
    expect(routeFamily('/api/ai/chat/conversation-123')).toBe('/api/ai');
    expect(routeFamily('/private/client-name')).toBe('/other');
  });

  it('uses bounded failure classes instead of error messages', () => {
    expect(failureClass(new Error('client@example.com'))).toBe('unexpected_error');
    expect(failureClass(new TypeError('secret payload'))).toBe('type_error');
    expect(failureClass(undefined, 503)).toBe('server_error');
    expect(failureClass(undefined, 401)).toBe('client_error');
  });

  it('emits release-correlated fields without arbitrary error data', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logOperationalEvent({
      level: 'error',
      event: 'request.failed',
      env: {
        NODE_ENV: 'production',
        CF_VERSION_METADATA: { tag: 'commit-sha', id: 'worker-version', timestamp: '2026-07-12T00:00:00Z' },
      },
      correlationId: 'correlation-id',
      route: '/api/auth',
      outcome: 'failed',
      failureClass: 'server_error',
      status: 503,
    });

    const entry = JSON.parse(String(error.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({
      environment: 'production',
      release: 'commit-sha',
      deployment_id: 'worker-version',
      correlation_id: 'correlation-id',
      route: '/api/auth',
      failure_class: 'server_error',
      status: 503,
    });
    expect(entry).not.toHaveProperty('error');
    expect(entry).not.toHaveProperty('stack');
  });
});
