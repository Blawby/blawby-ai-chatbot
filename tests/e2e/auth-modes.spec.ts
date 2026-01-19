import { test, expect } from '@playwright/test';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForSession } from './helpers/auth';

const e2eConfig = loadE2EConfig();
const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || 'https://local.blawby.com';
const AUTH_STATE_OWNER = 'playwright/.auth/owner.json';

const resolveBaseUrl = (baseURL?: string): string => {
  if (typeof baseURL === 'string' && baseURL.length > 0) return baseURL;
  return DEFAULT_BASE_URL;
};

test.describe('Auth modes', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial' });

  test('requires session cookies for worker APIs', async ({ browser }) => {
    if (!e2eConfig) return;

    const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
    const context = await browser.newContext({ storageState: AUTH_STATE_OWNER, baseURL });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 20000 });

    const sessionWithCookies = await page.evaluate(async () => {
      const response = await fetch('/api/auth/get-session', { credentials: 'include' });
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      const hasSession = Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user);
      return { status: response.status, hasSession };
    });

    const sessionWithoutCookies = await page.evaluate(async () => {
      const response = await fetch('/api/auth/get-session', { credentials: 'omit' });
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      const hasSession = Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user);
      return { status: response.status, hasSession };
    });

    expect(sessionWithCookies.status).toBe(200);
    expect(sessionWithCookies.hasSession).toBeTruthy();
    expect(sessionWithoutCookies.hasSession).toBeFalsy();

    const unauthContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { Cookie: '' }
    });
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

    const conversationWithAuthResponse = await context.request.get(
      `/api/conversations/active?practiceId=${encodeURIComponent(e2eConfig.practice.id)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const conversationWithAuthPayload = await conversationWithAuthResponse.json().catch(() => null) as {
      data?: { conversation?: { id?: string } };
    } | null;
    const conversationId = conversationWithAuthPayload?.data?.conversation?.id;

    expect(conversationWithAuthResponse.status()).toBe(200);
    expect(conversationId).toBeTruthy();

    await unauthContext.close();
    await context.close();
  });
});
