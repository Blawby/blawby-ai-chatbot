import { expect, test } from './fixtures.auth';

const OTHER_PRACTICE_ID = '00000000-0000-4000-8000-000000000718';

const expectDenied = async (response: { status(): number; text(): Promise<string> }) => {
  expect([400, 401, 403, 404], await response.text()).toContain(response.status());
};

test.describe('launch security isolation', () => {
  test('owner session cannot cross Practice boundaries through path or query identifiers', async ({ ownerContext }) => {
    await expectDenied(await ownerContext.request.get(`/api/reports/${OTHER_PRACTICE_ID}/revenue`));
    await expectDenied(await ownerContext.request.get(`/api/activity?practiceId=${OTHER_PRACTICE_ID}`));
    await expectDenied(await ownerContext.request.get(`/api/invoices/${OTHER_PRACTICE_ID}`));
  });

  test('client session cannot cross Practice boundaries through path or query identifiers', async ({ clientContext }) => {
    await expectDenied(await clientContext.request.get(`/api/reports/${OTHER_PRACTICE_ID}/revenue`));
    await expectDenied(await clientContext.request.get(`/api/activity?practiceId=${OTHER_PRACTICE_ID}`));
    await expectDenied(await clientContext.request.get(`/api/invoices/${OTHER_PRACTICE_ID}`));
  });

  test('unauthenticated requests cannot reach authenticated Practice surfaces', async ({ unauthContext }) => {
    await expectDenied(await unauthContext.request.get(`/api/reports/${OTHER_PRACTICE_ID}/revenue`));
    await expectDenied(await unauthContext.request.get(`/api/activity?practiceId=${OTHER_PRACTICE_ID}`));
  });

  test('deployed Worker emits security headers and keeps debug/status surfaces closed', async ({ unauthContext }) => {
    const health = await unauthContext.request.get('/api/health');
    expect(health.status()).toBe(200);
    expect(health.headers()['content-security-policy']).toContain("default-src 'none'");
    expect(health.headers()['strict-transport-security']).toContain('includeSubDomains');
    expect(health.headers()['x-frame-options']).toBe('DENY');
    expect(health.headers()['x-content-type-options']).toBe('nosniff');
    expect(health.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(health.headers()['permissions-policy']).toContain('camera=()');

    await expectDenied(await unauthContext.request.get('/api/debug/adobe-test'));
    await expectDenied(await unauthContext.request.get('/api/test/anything'));
    await expectDenied(await unauthContext.request.get('/api/status/anything'));
  });
});
