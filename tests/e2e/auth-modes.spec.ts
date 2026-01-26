import { expect, test } from './fixtures';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

test.describe('Auth modes', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test('requires session cookies for worker APIs', async ({ baseURL, ownerContext, unauthContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const ownerUserId = await waitForSession(page, { timeoutMs: 30000 });
    await page.close();
    expect(ownerUserId).toBeTruthy();

    const sessionWithoutCookiesResponse = await unauthContext.request.get('/api/auth/get-session', {
      headers: { 'Content-Type': 'application/json', Cookie: '' }
    });
    const sessionWithoutCookiesPayload = await sessionWithoutCookiesResponse.json().catch(() => null) as {
      data?: { user?: { id?: string } } | null;
      user?: { id?: string } | null;
      session?: { user?: { id?: string } } | null;
    } | null;
    const hasSessionWithoutCookies = Boolean(
      sessionWithoutCookiesPayload?.user?.id ||
      sessionWithoutCookiesPayload?.data?.user?.id ||
      sessionWithoutCookiesPayload?.session?.user?.id
    );
    expect(sessionWithoutCookiesResponse.status()).toBe(200);
    expect(hasSessionWithoutCookies).toBeFalsy();

    const unauthCookies = await unauthContext.cookies(baseURL);
    console.info('[Auth modes] Unauth context cookies:', unauthCookies);
    console.info('[Auth modes] Unauth request headers:', { Cookie: '' });

    const conversationWithoutAuthResponse = await unauthContext.request.get(
      `/api/conversations/active?practiceId=${encodeURIComponent(e2eConfig.practice.id)}`,
      { headers: { 'Content-Type': 'application/json', Cookie: '' } }
    );
    const conversationWithoutAuthPayload = await conversationWithoutAuthResponse
      .json()
      .catch(() => null) as { error?: string; message?: string } | null;

    expect(conversationWithoutAuthResponse.status()).toBe(401);
    const unauthError = conversationWithoutAuthPayload?.error ?? conversationWithoutAuthPayload?.message;
    expect(unauthError).toBeTruthy();
    if (unauthError) {
      expect(String(unauthError)).toMatch(/auth/i);
    }

    const conversationWithAuthResponse = await ownerContext.request.get(
      `/api/conversations/active?practiceId=${encodeURIComponent(e2eConfig.practice.id)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const conversationWithAuthPayload = await conversationWithAuthResponse.json().catch(() => null) as {
      data?: { conversation?: { id?: string } };
    } | null;
    const conversationId = conversationWithAuthPayload?.data?.conversation?.id;

    expect(conversationWithAuthResponse.status()).toBe(200);
    expect(conversationId).toBeTruthy();
  });
});
