import { expect, test } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

const fetchSession = async (
  request: APIRequestContext
): Promise<{ status: number; hasSession: boolean; retryAfterMs: number | null }> => {
  const response = await request.get('/api/auth/get-session', {
    headers: { 'Content-Type': 'application/json' }
  });
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  const retryAfter = response.headers()['retry-after'];
  const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : null;
  const hasSession = Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user);
  return { status: response.status(), hasSession, retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : null };
};

const fetchSessionWithRetry = async (
  request: APIRequestContext
): Promise<{ status: number; hasSession: boolean }> => {
  const result = await fetchSession(request);
  return { status: result.status, hasSession: result.hasSession };
};

test.describe('Auth modes', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test('requires session cookies for worker APIs', async ({ baseURL, ownerContext, unauthContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 30000 });
    await page.close();

    const sessionWithCookies = await fetchSessionWithRetry(ownerContext.request);
    const sessionWithoutCookies = await fetchSessionWithRetry(unauthContext.request);

    expect(sessionWithCookies.status).toBe(200);
    expect(sessionWithCookies.hasSession).toBeTruthy();
    expect(sessionWithoutCookies.hasSession).toBeFalsy();

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
