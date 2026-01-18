import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config/urls', () => ({
  getWorkerApiUrl: () => 'http://worker.test',
  getBackendApiUrl: () => 'https://backend.test'
}));

import { submitContactForm } from '@/shared/utils/forms';

describe('submitContactForm', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'loading-id'
    } as Crypto);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses the new intake create endpoint and returns payment_link_url', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    fetchMock.mockImplementation((input: unknown) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : String(input);
      if (url.includes('/api/practice-client-intakes/') && url.includes('/intake')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              organization: { name: 'Acme Law', logo: 'logo.png' },
              settings: { paymentLinkEnabled: true, prefillAmount: 75.6 }
            }
          })
        });
      }
      if (url.includes('/api/practice/client-intakes/create')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              uuid: 'uuid-123',
              payment_link_url: 'https://pay.test/checkout',
              amount: 76,
              currency: 'usd',
              status: 'pending',
              organization: { name: 'Acme Law', logo: 'logo.png' }
            }
          })
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not Found' })
      });
    });

    const result = await submitContactForm(
      { name: 'Test User', email: 'test@example.com' },
      'acme-law'
    );

    const createCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/practice/client-intakes/create')
    );

    expect(createCall).toBeTruthy();
    expect(String(createCall?.[0])).toContain('/api/practice/client-intakes/create');
    expect(String(createCall?.[0])).not.toContain('/api/practice-client-intakes/create');

    const body = JSON.parse(String(createCall?.[1]?.body ?? '{}')) as { amount?: number };
    expect(body.amount).toBe(76);

    expect(result.intake?.paymentLinkUrl).toBe('https://pay.test/checkout');
    expect(result.intake?.uuid).toBe('uuid-123');
  });
});
