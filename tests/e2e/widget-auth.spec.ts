import { expect, test } from './fixtures.auth';
import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';
import { AUTH_STATE_PATHS } from './helpers/authState';

const e2eConfig = loadE2EConfig();
const BACKEND_API_URL = process.env.E2E_BACKEND_API_URL || 'https://staging-api.blawby.com';
if (!process.env.E2E_BACKEND_API_URL) {
  console.warn('E2E_BACKEND_API_URL is not set; defaulting to https://staging-api.blawby.com.');
}

type InviteResponse = {
  status: number;
  data?: { success?: boolean; message?: string };
  url?: string;
  rawText?: string;
};

type IntakeCreateData = {
  uuid?: string;
  paymentLinkUrl?: string;
  clientSecret?: string;
  amount?: number;
  currency?: string;
  address?: {
    address: string;
    apartment?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
};

const normalizePracticeSlug = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || trimmed;
    } catch {
      return trimmed;
    }
  }
  if (trimmed.includes('/')) {
    const segments = trimmed.split('/').filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  }
  return trimmed;
};

const buildCookieHeader = async (context: BrowserContext, baseURL: string): Promise<string> => {
  let cookies = await context.cookies(baseURL);
  if (!cookies.length) {
    cookies = await context.cookies();
  }
  if (!cookies.length) return '';
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

test.describe('Widget Authentication', () => {
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
  });

  test('Google OAuth flow creates valid session', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Trigger Google OAuth
    await page.getByRole('button', { name: /continue with google/i }).click();
    
    // Wait for OAuth redirect and complete flow
    await page.waitForURL(/\/oauth\/callback/);
    await page.waitForTimeout(2000);
    
    const userId = await waitForSession(page, { timeoutMs: 30000 });
    expect(userId).toBeTruthy();
    
    // Verify session persists
    const sessionResponse = await page.request.get('/api/auth/get-session');
    const sessionPayload = await sessionResponse.json();
    expect(sessionPayload.user?.id).toBe(userId);
    
    await page.close();
  });

  test('Email signup flow creates valid session', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    const uniqueId = randomUUID().slice(0, 8);
    const email = `test-auth+${uniqueId}@example.com`;
    const password = `TestAuth!${uniqueId}Aa`;
    
    // Click email signup
    await page.getByRole('button', { name: /continue with email/i }).click();
    
    // Fill signup form
    await page.getByTestId('signup-name-input').fill(`Test User ${uniqueId}`);
    await page.getByTestId('signup-email-input').fill(email);
    await page.getByTestId('signup-password-input').fill(password);
    await page.getByTestId('signup-confirm-password-input').fill(password);
    await page.getByTestId('signup-submit-button').click();
    
    const userId = await waitForSession(page, { timeoutMs: 30000 });
    expect(userId).toBeTruthy();
    
    await page.close();
  });

  test('Email signin flow works for existing users', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Click email signin
    await page.getByRole('button', { name: /continue with email/i }).click();
    
    // Switch to signin mode
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Use existing E2E credentials from config
    await page.getByTestId('signin-email-input').fill(process.env.E2E_USER_EMAIL || 'test@example.com');
    await page.getByTestId('signin-password-input').fill(process.env.E2E_USER_PASSWORD || 'testpassword');
    await page.getByTestId('signin-submit-button').click();
    
    const userId = await waitForSession(page, { timeoutMs: 30000 });
    expect(userId).toBeTruthy();
    
    await page.close();
  });

  test('intake invite creates valid intake link', async ({ ownerContext, unauthContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const userId = await waitForSession(page, { timeoutMs: 30000 });
    expect(userId).toBeTruthy();
    await page.close();

    const uniqueId = randomUUID().slice(0, 8);
    const clientEmail = `intake-invite+${uniqueId}@example.com`;
    const clientName = `Intake Invite ${uniqueId}`;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);

    const invitePayload = {
      clientEmail,
      clientName,
      practiceId: e2eConfig.practice.id,
      practiceSlug,
      message: 'Test intake invite for E2E',
    };

    const inviteResponse: InviteResponse = await (async () => {
      try {
        const cookieHeader = await buildCookieHeader(ownerContext, new URL(BACKEND_API_URL).origin);
        const response = await ownerContext.request.post(`${BACKEND_API_URL}/api/intake-invite`, {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader,
          },
          data: invitePayload,
        });
        return {
          status: response.status(),
          data: await response.json().catch(() => null),
          url: response.url(),
        };
      } catch (error) {
        return {
          status: 0,
          data: null,
          url: BACKEND_API_URL + '/api/intake-invite',
          rawText: error instanceof Error ? error.message : String(error),
        };
      }
    })();

    expect(inviteResponse.status).toBe(200);
    expect(inviteResponse.data?.success).toBe(true);

    const cookieHeader = await buildCookieHeader(ownerContext, new URL(BACKEND_API_URL).origin);

    const inviteLinkPayload = inviteResponse.data;
    if (!inviteLinkPayload?.message || typeof inviteLinkPayload.message !== 'string') {
      throw new Error('Invite response missing message or message is not a string');
    }

    let intakeInviteLink: string;
    try {
      const parsed = JSON.parse(inviteLinkPayload.message);
      if (!parsed.inviteLink || typeof parsed.inviteLink !== 'string') {
        throw new Error('Parsed message missing inviteLink or inviteLink is not a string');
      }
      intakeInviteLink = parsed.inviteLink;
    } catch (parseError) {
      throw new Error(`Failed to parse invite link from message: ${inviteLinkPayload.message}`);
    }

    expect(intakeInviteLink).toBeTruthy();
    expect(intakeInviteLink).toMatch(/^https?:\/\//);

    const unauthPage = await unauthContext.newPage();
    await unauthPage.goto(intakeInviteLink, { waitUntil: 'domcontentloaded' });

    await expect(unauthPage.locator('body')).toContainText(practiceSlug, { timeout: 15000 });

    await expect(unauthPage.locator('body')).toContainText(clientName, { timeout: 15000 });

    const messageInput = unauthPage.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await unauthPage.close();
  });

  test('session persistence across page reloads', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    const userId1 = await waitForSession(page, { timeoutMs: 30000 });
    expect(userId1).toBeTruthy();
    
    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    // Session should persist
    const userId2 = await waitForSession(page, { timeoutMs: 10000 });
    expect(userId2).toBe(userId1);
    
    await page.close();
  });

  test('session invalidation on logout', async ({ ownerContext }) => {
    if (!e2eConfig) return;

    const page = await ownerContext.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    const userId = await waitForSession(page, { timeoutMs: 30000 });
    expect(userId).toBeTruthy();
    
    // Logout
    await page.getByRole('button', { name: /logout/i }).click();
    await page.waitForTimeout(2000);
    
    // Session should be invalid
    const sessionResponse = await page.request.get('/api/auth/get-session');
    expect(sessionResponse.status()).toBe(200);
    
    const sessionPayload = await sessionResponse.json();
    expect(sessionPayload.user).toBeFalsy();
    
    await page.close();
  });
});
