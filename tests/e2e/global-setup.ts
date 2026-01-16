import { FullConfig } from '@playwright/test';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadE2EConfig } from './helpers/e2eConfig';
import { persistTokenToLocalStorage, waitForSession, waitForToken } from './helpers/auth';

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
  const baseUrl = process.env.VITE_API_URL || 'http://localhost:8787';

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

const verifyBetterAuthSecret = async (): Promise<void> => {
  try {
    const devVarsPath = join(process.cwd(), '.dev.vars');
    const devVarsContent = readFileSync(devVarsPath, 'utf-8');
    const hasSecret = devVarsContent.includes('BETTER_AUTH_SECRET=');

    if (!hasSecret) {
      console.warn('⚠️  BETTER_AUTH_SECRET not found in .dev.vars');
      console.warn('⚠️  Tests may use memory adapter instead of D1');
      console.warn('⚠️  See docs/testing.md for setup instructions');
    } else {
      console.log('✅ BETTER_AUTH_SECRET found in .dev.vars');
    }
  } catch (error) {
    console.warn('⚠️  Could not read .dev.vars:', error);
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
    await page.addInitScript(() => {
      try {
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('onboardingCheckDone', 'true');
      } catch {}
    });

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
      console.warn(`⚠️  Session check timed out for ${label}; continuing with token check.`);
    }
    let token: string;
    try {
      token = await waitForToken(page, { timeoutMs: authTimeoutMs });
    } catch (error) {
      const resultsDir = ensureResultsDir();
      const htmlPath = join(resultsDir, `signin-token-timeout-${label}.html`);
      const screenshotPath = join(resultsDir, `signin-token-timeout-${label}.png`);
      writeFileSync(htmlPath, await page.content());
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throw error;
    }
    await persistTokenToLocalStorage(page, token);

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
    await page.addInitScript(() => {
      try {
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('onboardingCheckDone', 'true');
      } catch {}
    });

    await page.goto(`/p/${encodeURIComponent(practiceSlug)}`);
    await page.waitForLoadState('domcontentloaded');

    const token = await waitForToken(page, { timeoutMs: 20000 });
    await persistTokenToLocalStorage(page, token);

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
  await verifyBetterAuthSecret();

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

  await createSignedInState({
    baseURL,
    storagePath: ownerPath,
    email: e2eConfig.owner.email,
    password: e2eConfig.owner.password,
    label: 'owner'
  });

  await createSignedInState({
    baseURL,
    storagePath: clientPath,
    email: e2eConfig.client.email,
    password: e2eConfig.client.password,
    label: 'client'
  });

  await createAnonymousState({
    baseURL,
    storagePath: anonymousPath,
    practiceSlug: e2eConfig.practice.slug
  });

  console.log('✅ Global setup complete');
}

export default globalSetup;
