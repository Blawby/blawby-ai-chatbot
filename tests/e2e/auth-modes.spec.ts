import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

const fetchSession = async (
  page: Page,
  credentials: RequestCredentials
): Promise<{ status: number; hasSession: boolean; retryAfterMs: number | null }> => {
  return page.evaluate(async (creds) => {
    const response = await fetch('/api/auth/get-session', { credentials: creds });
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    const retryAfter = response.headers.get('Retry-After');
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : null;
    const hasSession = Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user);
    return { status: response.status, hasSession, retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : null };
  }, credentials);
};

const fetchSessionWithRetry = async (
  page: Page,
  credentials: RequestCredentials
): Promise<{ status: number; hasSession: boolean }> => {
  const maxAttempts = 3;
  let retryDelayMs = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await fetchSession(page, credentials);
    if (result.status !== 429 || attempt >= maxAttempts - 1) {
      return { status: result.status, hasSession: result.hasSession };
    }

    const waitMs = result.retryAfterMs ?? retryDelayMs;
    await page.waitForTimeout(Math.min(Math.max(waitMs, 250), 3000));
    retryDelayMs = Math.min(retryDelayMs * 2, 3000);
  }

  return { status: 429, hasSession: false };
};

test.describe('Auth modes', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test('requires session cookies for worker APIs', async ({ baseURL, ownerContext, unauthContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 30000 });

    const sessionWithCookies = await fetchSessionWithRetry(page, 'include');
    const sessionWithoutCookies = await fetchSessionWithRetry(page, 'omit');

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
    await page.close();
  });
});
