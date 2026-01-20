import { FullConfig } from '@playwright/test';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForSession } from './helpers/auth';

const EMPTY_STORAGE_STATE = {
  cookies: [],
  origins: []
};

const ensureAuthDir = (): string => {
  const authDir = join(process.cwd(), 'playwright', '.auth');
  mkdirSync(authDir, { recursive: true });
  return authDir;
};

const ensureResultsDir = (): string => {
  const resultsDir = join(process.cwd(), 'playwright', 'results');
  mkdirSync(resultsDir, { recursive: true });
  return resultsDir;
};

const writeEmptyStorageState = (path: string): void => {
  writeFileSync(path, JSON.stringify(EMPTY_STORAGE_STATE, null, 2));
};

type StorageState = {
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
};

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
  const cookieHeader = state.cookies
    .filter((cookie) => cookieMatchesHost(cookie.domain, host))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  if (!cookieHeader) {
    return false;
  }

  try {
    const response = await fetch(`${baseURL}/api/auth/get-session`, {
      headers: { Cookie: cookieHeader }
    });
    if (!response.ok) {
      return false;
    }
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return false;
    }
    const record = data as Record<string, unknown>;
    if (record.session || record.user) {
      return true;
    }
    const nested = record.data;
    if (!nested || typeof nested !== 'object') {
      return false;
    }
    const nestedRecord = nested as Record<string, unknown>;
    return Boolean(nestedRecord.session || nestedRecord.user);
  } catch {
    return false;
  }
};

const getBaseUrlFromConfig = (config: FullConfig): string => {
  const project = config.projects[0];
  const baseURL = project?.use?.baseURL;
  if (typeof baseURL === 'string' && baseURL.length > 0) {
    return baseURL;
  }
  return process.env.E2E_BASE_URL || 'https://local.blawby.com';
};

const verifyWorkerHealth = async (): Promise<void> => {
  const maxRetries = 10;
  const retryDelay = 2000;
  const baseUrl = process.env.VITE_WORKER_API_URL || process.env.E2E_WORKER_URL || 'http://localhost:8787';

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        console.log('✅ Worker is running and healthy');
        return;
      }
    } catch {
      // retry below
    }

    if (i === maxRetries - 1) {
      throw new Error(
        `Worker health check failed after ${maxRetries} attempts. ` +
        `Make sure wrangler is running: npm run dev:worker:clean`
      );
    }
    console.log(`⏳ Waiting for worker... (attempt ${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
};


const waitForBaseUrl = async (baseURL: string): Promise<void> => {
  const maxRetries = 15;
  const retryDelay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(baseURL, { method: 'GET' });
      if (response.ok || (response.status >= 300 && response.status < 500)) {
        console.log(`✅ Base URL reachable: ${baseURL}`);
        return;
      }
    } catch {
      // retry below
    }

    if (i === maxRetries - 1) {
      throw new Error(`Base URL not reachable after ${maxRetries} attempts: ${baseURL}`);
    }
    console.log(`⏳ Waiting for base URL... (attempt ${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
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

  try {
    await page.goto('/auth?mode=signin', { waitUntil: 'domcontentloaded', timeout: authTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: authTimeoutMs }).catch(() => undefined);

    try {
      await page.locator('[data-testid="signin-email-input"]').waitFor({ state: 'visible', timeout: authTimeoutMs });
      await page.locator('[data-testid="signin-password-input"]').waitFor({ state: 'visible', timeout: authTimeoutMs });
      await page.locator('[data-testid="signin-submit-button"]').waitFor({ state: 'visible', timeout: authTimeoutMs });
    } catch (error) {
      const resultsDir = ensureResultsDir();
      const htmlPath = join(resultsDir, `signin-timeout-${label}.html`);
      const screenshotPath = join(resultsDir, `signin-timeout-${label}.png`);
      writeFileSync(htmlPath, await page.content());
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throw error;
    }

    await page.fill('[data-testid="signin-email-input"]', email);
    await page.fill('[data-testid="signin-password-input"]', password);
    await page.click('[data-testid="signin-submit-button"]');
    await Promise.race([
      page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: authTimeoutMs }),
      page.waitForLoadState('networkidle', { timeout: authTimeoutMs })
    ]).catch(() => undefined);

    try {
      await waitForSession(page, { timeoutMs: authTimeoutMs });
    } catch (error) {
      const resultsDir = ensureResultsDir();
      const htmlPath = join(resultsDir, `signin-session-timeout-${label}.html`);
      const screenshotPath = join(resultsDir, `signin-session-timeout-${label}.png`);
      writeFileSync(htmlPath, await page.content());
      await page.screenshot({ path: screenshotPath, fullPage: true });
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
    await page.goto(`/p/${encodeURIComponent(practiceSlug)}`);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/get-session', { credentials: 'include' });
        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        const hasSession = Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user);
        if (!hasSession) {
          await fetch('/api/auth/sign-in/anonymous', { method: 'POST', credentials: 'include' });
        }
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

async function globalSetup(config: FullConfig) {
  console.log('🔧 Running Playwright global setup...');

  await verifyWorkerHealth();
  const e2eConfig = loadE2EConfig();
  const baseURL = getBaseUrlFromConfig(config);
  await waitForBaseUrl(baseURL);
  const authDir = ensureAuthDir();
  const ownerPath = join(authDir, 'owner.json');
  const clientPath = join(authDir, 'client.json');
  const anonymousPath = join(authDir, 'anonymous.json');

  if (!e2eConfig) {
    console.warn('⚠️  E2E credentials are not configured. Writing empty auth states.');
    writeEmptyStorageState(ownerPath);
    writeEmptyStorageState(clientPath);
    writeEmptyStorageState(anonymousPath);
    return;
  }

  if (await hasValidSessionFromStorage(baseURL, ownerPath)) {
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

  if (await hasValidSessionFromStorage(baseURL, clientPath)) {
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

  if (await hasValidSessionFromStorage(baseURL, anonymousPath)) {
    console.log(`✅ anonymous storageState already valid at ${anonymousPath}`);
  } else {
    await createAnonymousState({
      baseURL,
      storagePath: anonymousPath,
      practiceSlug: e2eConfig.practice.slug
    });
  }

  console.log('✅ Global setup complete');
}

export default globalSetup;
