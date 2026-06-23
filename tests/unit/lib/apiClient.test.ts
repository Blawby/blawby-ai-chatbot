import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('apiClient', () => {
  it('surfaces non-JSON error responses as HttpError instead of JSON parse errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<!DOCTYPE html><title>Bad Gateway</title>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    try {
      await apiClient.get('https://worker.test/api/engagement-contracts/practice-1');
      throw new Error('Expected apiClient.get to throw');
    } catch (error) {
      expect(isHttpError(error)).toBe(true);
      if (!isHttpError(error)) throw error;
      expect(error.response.status).toBe(502);
      expect(error.message).toContain('<!DOCTYPE html>');
    }
  });
});
