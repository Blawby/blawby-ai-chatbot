import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleError, HttpErrors } from '../../../worker/errorHandler.js';

describe('public error sanitization', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose unexpected error messages or stacks and returns a correlation ID', async () => {
    const response = handleError(
      new Error('database password=secret-value\ninternal stack detail'),
      'correlation-123',
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(response.headers.get('X-Request-ID')).toBe('correlation-123');
    expect(body).toEqual({
      success: false,
      error: 'Internal server error',
      errorCode: 'GENERIC_ERROR',
      correlationId: 'correlation-123',
    });
    expect(JSON.stringify(body)).not.toMatch(/secret-value|stack detail|password/i);
    expect(console.error).toHaveBeenCalledOnce();
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).not.toMatch(/secret-value|stack detail|password/i);
  });

  it('uses a server error correlation reference without exposing it as details', async () => {
    const response = handleError(
      HttpErrors.internalServerError('Action execution failed', { correlationId: 'action-correlation' }),
    );

    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Internal server error',
      errorCode: 'HTTP_500',
      correlationId: 'action-correlation',
    });
    expect(response.headers.get('X-Request-ID')).toBe('action-correlation');
  });

  it('sanitizes explicit server errors while preserving safe client errors', async () => {
    const serverResponse = handleError(
      HttpErrors.internalServerError('upstream configuration is broken'),
      'server-correlation',
    );
    const clientResponse = handleError(HttpErrors.badRequest('practiceId is required'), 'client-correlation');

    await expect(serverResponse.json()).resolves.toMatchObject({ error: 'Internal server error' });
    await expect(clientResponse.json()).resolves.toMatchObject({
      error: 'practiceId is required',
      correlationId: 'client-correlation',
    });
  });
});
