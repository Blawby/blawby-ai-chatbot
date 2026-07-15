import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, isHttpError, resolveIntakeInvitationPrefill } from '@/shared/lib/apiClient';

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

  it('resolves opaque intake invitation tokens through the authenticated backend endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'intake',
          intakeId: '10000000-0000-4000-8000-000000000001',
          conversationId: '10000000-0000-4000-8000-000000000002',
          email: 'client@example.com',
          orgName: 'Test Practice',
          orgSlug: 'test-practice',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(resolveIntakeInvitationPrefill('opaque_token')).resolves.toMatchObject({
      type: 'intake',
      email: 'client@example.com',
      orgSlug: 'test-practice',
    });

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(String(url)).toContain('/api/practice-client-intakes/invitation-prefill?token=opaque_token');
    expect(init).toMatchObject({ credentials: 'include', method: 'GET' });
  });

  it('fast-fails malformed invitation prefill responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'intake' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(resolveIntakeInvitationPrefill('opaque_token')).rejects.toThrow(
      'Invitation prefill response is malformed'
    );
  });
});
