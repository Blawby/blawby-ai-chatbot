import type { FullConfig } from '@playwright/test';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForSession } from './helpers/auth';
import { AUTH_DIR, AUTH_STATE_PATHS } from './helpers/authState';
import { getBaseUrlFromConfig } from './helpers/baseUrl';

const SESSION_COOKIE_PATTERN = /better-auth\.session_token/i;

type StorageState = {
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
  }>;
};

const FORCE_AUTH_REFRESH = ['true', '1', 'yes'].includes(
  (process.env.E2E_FORCE_AUTH_REFRESH || '').toLowerCase()
);

const ensureAuthDir = (): string => {
  mkdirSync(AUTH_DIR, { recursive: true });
  return AUTH_DIR;
};

const ensureResultsDir = (): string => {
  const resultsDir = join(process.cwd(), 'playwright', 'results');
  mkdirSync(resultsDir, { recursive: true });
  return resultsDir;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const cookieMatchesHost = (cookieDomain: string | undefined, host: string): boolean => {
  if (!cookieDomain) return false;
  const normalized = cookieDomain.toLowerCase();
  const target = host.toLowerCase();
  if (normalized.startsWith('.')) {
    const suffix = normalized.slice(1);
    return target === suffix || target.endsWith(normalized);
  }
  return normalized === target;
};

const hasValidSessionFromStorage = async (baseURL: string, storagePath: string): Promise<boolean> => {
  if (!existsSync(storagePath)) {
    return false;
  }
  let state: StorageState | null = null;
  try {
    state = JSON.parse(readFileSync(storagePath, 'utf-8')) as StorageState;
  } catch {
    return false;
  }
  if (!state?.cookies?.length) {
    return false;
  }

  const host = new URL(baseURL).hostname;
  const nowSeconds = Date.now() / 1000;
  const matchingCookies = state.cookies.filter((cookie) => (
    cookieMatchesHost(cookie.domain, host) &&
    SESSION_COOKIE_PATTERN.test(cookie.name) &&
    (cookie.expires === undefined || cookie.expires <= 0 || cookie.expires > nowSeconds + 1)
  ));
  if (!matchingCookies.length) {
    return false;
  }

  const cookieHeader = matchingCookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  if (!cookieHeader) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${baseURL}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    const container = payload && typeof payload === 'object'
      ? ('data' in payload && payload.data && typeof payload.data === 'object'
        ? payload.data as Record<string, unknown>
        : payload)
      : null;
    if (!container || typeof container !== 'object') {
      return false;
    }
    const user = (container as { user?: { id?: string } }).user;
    const session = (container as { session?: { user?: { id?: string } } }).session;
    return Boolean(user?.id || session?.user?.id);
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

const verifyWorkerHealth = async (): Promise<void> => {
  const baseUrl = process.env.VITE_WORKER_API_URL || process.env.E2E_WORKER_URL || 'http://localhost:8787';
  const deadline = Date.now() + 8000;
  let lastErrorMessage = '';
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
      if (response.ok) {
        console.log('✅ Worker is running and healthy');
        return;
      }
      const body = await response.text().catch(() => '');
      lastErrorMessage = `Worker health check failed: ${response.status} ${body.slice(0, 200)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastErrorMessage = `Worker health check failed. Make sure wrangler is running: npm run dev:worker:clean. ${message}`;
    } finally {
      clearTimeout(timeoutId);
    }
    await sleep(300);
  }
  throw new Error(lastErrorMessage || 'Worker health check timed out after 8000ms.');
};

const waitForBaseUrl = async (baseURL: string): Promise<void> => {
  const deadline = Date.now() + 8000;
  let lastErrorMessage = '';
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    try {
      const response = await fetch(baseURL, { method: 'GET', signal: controller.signal });
      if (response.ok || (response.status >= 300 && response.status < 500)) {
        console.log(`✅ Base URL reachable: ${baseURL}`);
        return;
      }
      const body = await response.text().catch(() => '');
      lastErrorMessage = `Base URL returned ${response.status}: ${body.slice(0, 200)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastErrorMessage = `Base URL not reachable: ${baseURL}. ${message}`;
    } finally {
      clearTimeout(timeoutId);
    }
    await sleep(300);
  }
  throw new Error(lastErrorMessage || `Base URL check timed out after 8000ms: ${baseURL}`);
};

const createSignedInState = async (options: {
  baseURL: string;
  storagePath: string;
  email: string;
  password: string;
  label: string;
}): Promise<void> => {
  const { baseURL, storagePath, email, password, label } = options;
  console.log(`🔐 Signing in ${label}...`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const authTimeoutMs = 60000;
  page.setDefaultTimeout(authTimeoutMs);
  page.setDefaultNavigationTimeout(authTimeoutMs);
  const authNetworkLogs: string[] = [];
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  const authResponseHandler = async (response: {
    url: () => string;
    status: () => number;
    request: () => { method: () => string };
    text: () => Promise<string>;
  }) => {
    const url = response.url();
    if (!url.includes('/api/auth/')) return;
    const status = response.status();
    const method = response.request().method();
    await response.text().catch(() => '');
    authNetworkLogs.push(`[auth] ${method} ${status} ${url} [REDACTED]`);
  };
  const authRequestFailedHandler = (request: { url: () => string; method: () => string; failure: () => { errorText?: string } | null }) => {
    const url = request.url();
    if (!url.includes('/api/auth/')) return;
    const method = request.method();
    const failure = request.failure();
    authNetworkLogs.push(`[auth] ${method} FAILED ${url} ${failure?.errorText ?? ''}`.trim());
  };
  const consoleHandler = (message: { type: () => string; text: () => string }) => {
    const type = message.type();
    if (type === 'error' || type === 'warning') {
      consoleLogs.push(`[console:${type}] ${message.text()}`);
    }
  };
  const pageErrorHandler = (error: Error) => {
    pageErrors.push(`[pageerror] ${error.message}`);
  };

  page.on('response', authResponseHandler as never);
  page.on('requestfailed', authRequestFailedHandler as never);
  page.on('console', consoleHandler as never);
  page.on('pageerror', pageErrorHandler as never);

  try {
    await page.goto('/auth?mode=signin', { waitUntil: 'domcontentloaded', timeout: authTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: authTimeoutMs }).catch(() => undefined);
    await page.locator('[data-testid="signin-email-input"]').waitFor({ state: 'visible', timeout: authTimeoutMs });
    await page.locator('[data-testid="signin-password-input"]').waitFor({ state: 'visible', timeout: authTimeoutMs });
    await page.locator('[data-testid="signin-submit-button"]').waitFor({ state: 'visible', timeout: authTimeoutMs });

    await page.fill('[data-testid="signin-email-input"]', email);
    await page.fill('[data-testid="signin-password-input"]', password);
    const signInResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/auth/sign-in') && response.request().method() === 'POST',
      { timeout: 20000 }
    ).catch(() => null);
    await page.click('[data-testid="signin-submit-button"]');
    const signInResponse = await signInResponsePromise;
    if (signInResponse) {
      authNetworkLogs.push(
        `[auth] POST ${signInResponse.status()} ${signInResponse.url()} [REDACTED]`
      );
    } else {
      authNetworkLogs.push('[auth] No sign-in response captured within 20s');
    }
    await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: authTimeoutMs }),
      page.waitForLoadState('networkidle', { timeout: authTimeoutMs })
    ]).catch(() => undefined);

    try {
      await waitForSession(page, { timeoutMs: authTimeoutMs });
    } catch (error) {
      const resultsDir = ensureResultsDir();
      const networkPath = join(resultsDir, `signin-session-network-${label}.txt`);
      const consolePath = join(resultsDir, `signin-session-console-${label}.txt`);
      if (authNetworkLogs.length > 0) {
        writeFileSync(networkPath, authNetworkLogs.join('\n'));
      }
      if (consoleLogs.length > 0 || pageErrors.length > 0) {
        writeFileSync(consolePath, [...consoleLogs, ...pageErrors].join('\n'));
      }
      throw error;
    }

    try {
      await page.evaluate(async () => {
        try {
          await fetch('/api/preferences/onboarding', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              completed: true,
              welcome_modal_shown: true,
              practice_welcome_shown: true
            })
          });
        } catch {
          // Ignore preference update failures in e2e bootstrap
        }
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed')) {
        console.warn('E2E setup onboarding preference update failed', error);
      }
    }

    await context.storageState({ path: storagePath });
    console.log(`✅ ${label} storageState saved to ${storagePath}`);
  } finally {
    page.off('response', authResponseHandler as never);
    page.off('requestfailed', authRequestFailedHandler as never);
    page.off('console', consoleHandler as never);
    page.off('pageerror', pageErrorHandler as never);
    await context.close();
    await browser.close();
  }
};

const createAnonymousState = async (options: {
  baseURL: string;
  storagePath: string;
  practiceSlug: string;
}): Promise<void> => {
  const { baseURL, storagePath, practiceSlug } = options;
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    const isAbsolute = practiceSlug.includes('://');
    const normalized = isAbsolute ? practiceSlug : `/public/${encodeURIComponent(practiceSlug)}`;
    await page.goto(normalized);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      try {
        await fetch('/api/auth/sign-in/anonymous', { method: 'POST', credentials: 'include' });
      } catch {
        // Ignore bootstrap failures; waitForSession will handle retries.
      }
    });

    await waitForSession(page, { timeoutMs: 60000 });

    await context.storageState({ path: storagePath });
    console.log(`✅ anonymous storageState saved to ${storagePath}`);
  } finally {
    await context.close();
    await browser.close();
  }
};

export const runPublicGlobalSetup = async (config: FullConfig): Promise<void> => {
  console.log('🔧 Running Playwright public global setup...');
  await verifyWorkerHealth();
  const baseURL = getBaseUrlFromConfig(config);
  await waitForBaseUrl(baseURL);
  console.log('✅ Public E2E setup complete');
};

export const runAuthGlobalSetup = async (config: FullConfig): Promise<void> => {
  console.log('🔧 Running Playwright auth global setup...');

  await verifyWorkerHealth();
  const e2eConfig = loadE2EConfig();
  const baseURL = getBaseUrlFromConfig(config);
  await waitForBaseUrl(baseURL);
  ensureAuthDir();
  const { owner: ownerPath, client: clientPath, anonymous: anonymousPath } = AUTH_STATE_PATHS;

  if (!e2eConfig) {
    throw new Error(
      'E2E credentials are not configured. Set E2E_PRACTICE_ID, E2E_PRACTICE_SLUG, E2E_OWNER_EMAIL, ' +
      'E2E_OWNER_PASSWORD, E2E_CLIENT_EMAIL, and E2E_CLIENT_PASSWORD before running the auth E2E suite.'
    );
  }

  if (!FORCE_AUTH_REFRESH && await hasValidSessionFromStorage(baseURL, ownerPath)) {
    console.log(`✅ owner storageState already valid at ${ownerPath}`);
  } else {
    await createSignedInState({
      baseURL,
      storagePath: ownerPath,
      email: e2eConfig.owner.email,
      password: e2eConfig.owner.password,
      label: 'owner'
    });
  }

  if (!FORCE_AUTH_REFRESH && await hasValidSessionFromStorage(baseURL, clientPath)) {
    console.log(`✅ client storageState already valid at ${clientPath}`);
  } else {
    await createSignedInState({
      baseURL,
      storagePath: clientPath,
      email: e2eConfig.client.email,
      password: e2eConfig.client.password,
      label: 'client'
    });
  }

  if (!FORCE_AUTH_REFRESH && await hasValidSessionFromStorage(baseURL, anonymousPath)) {
    console.log(`✅ anonymous storageState already valid at ${anonymousPath}`);
  } else {
    await createAnonymousState({
      baseURL,
      storagePath: anonymousPath,
      practiceSlug: e2eConfig.practice.slug
    });
  }

  console.log('✅ Auth E2E setup complete');
};
