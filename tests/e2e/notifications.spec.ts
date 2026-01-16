import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForToken } from './helpers/auth';

const e2eConfig = loadE2EConfig();
const AUTH_STATE_OWNER = 'playwright/.auth/owner.json';
const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || 'https://local.blawby.com';

const resolveBaseUrl = (baseURL?: string): string => {
  if (typeof baseURL === 'string' && baseURL.length > 0) return baseURL;
  return DEFAULT_BASE_URL;
};

const getSettingRow = (page: Page, label: string) => (
  page.locator('label', { hasText: label }).first().locator('..').locator('..')
);

type StorageState = {
  cookies?: Parameters<BrowserContext['addCookies']>[0];
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

type PreferencesJson = {
  profile?: {
    default_content_setting_values?: {
      notifications?: number;
    };
    content_settings?: {
      exceptions?: {
        notifications?: Record<string, { setting: number; last_modified: string }>;
      };
    };
  };
};

const ensureNotificationsAllowed = (userDataDir: string, baseURL: string): void => {
  const profileDir = join(userDataDir, 'Default');
  mkdirSync(profileDir, { recursive: true });

  const preferencesPath = join(profileDir, 'Preferences');
  let preferences: PreferencesJson = {};
  if (existsSync(preferencesPath)) {
    try {
      preferences = JSON.parse(readFileSync(preferencesPath, 'utf-8')) as PreferencesJson;
    } catch {
      preferences = {};
    }
  }

  const profile = (preferences.profile ??= {});
  const defaults = (profile.default_content_setting_values ??= {});
  defaults.notifications = 1;

  const exceptions = (((profile.content_settings ??= {}).exceptions ??= {}).notifications ??= {});
  const url = new URL(baseURL);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const exceptionKey = `${url.protocol}//${url.hostname}:${port},*`;
  exceptions[exceptionKey] = {
    setting: 1,
    last_modified: String((Date.now() + 11644473600000) * 1000)
  };

  writeFileSync(preferencesPath, JSON.stringify(preferences));
};

const applyStorageState = async (context: BrowserContext, baseURL: string): Promise<void> => {
  if (!existsSync(AUTH_STATE_OWNER)) return;
  let state: StorageState | null = null;
  try {
    state = JSON.parse(readFileSync(AUTH_STATE_OWNER, 'utf-8')) as StorageState;
  } catch {
    state = null;
  }
  if (!state) return;

  if (state.cookies?.length) {
    await context.addCookies(state.cookies);
  }

  const origin = new URL(baseURL).origin;
  const storedOrigin = state.origins?.find((item) => item.origin === origin);
  if (!storedOrigin?.localStorage?.length) return;

  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate((items) => {
    for (const item of items) {
      localStorage.setItem(item.name, item.value);
    }
  }, storedOrigin.localStorage);
  await page.close();
};

type NotificationSetup = {
  baseURL: string;
  context: BrowserContext;
  page: Page;
  destinationPayloads: Array<Record<string, unknown> | null>;
  destinationStatuses: number[];
  preferencePayloads: Array<Record<string, unknown> | null>;
  preferenceStatuses: number[];
  prefs: Record<string, unknown>;
};

const setupNotificationPage = async (
  options: { headless: boolean; userDataSuffix: string; waitForOneSignal?: boolean }
): Promise<NotificationSetup> => {
  const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
  const origin = new URL(baseURL).origin;
  const userDataDir = test.info().outputPath(`notifications-profile-${options.userDataSuffix}`);

  ensureNotificationsAllowed(userDataDir, origin);
  const context = await chromium.launchPersistentContext(userDataDir, {
    baseURL,
    permissions: ['notifications'],
    headless: options.headless,
    ignoreDefaultArgs: ['--disable-notifications']
  });
  await context.grantPermissions(['notifications'], { origin });
  await applyStorageState(context, baseURL);

  const page = await context.newPage();
  const destinationPayloads: Array<Record<string, unknown> | null> = [];
  const destinationStatuses: number[] = [];
  const preferencePayloads: Array<Record<string, unknown> | null> = [];
  const preferenceStatuses: number[] = [];

  page.on('request', (request) => {
    if (!request.url().includes('/api/notifications/destinations')) return;
    if (request.method() !== 'POST') return;
    let payload: Record<string, unknown> | null = null;
    try {
      payload = request.postDataJSON() as Record<string, unknown>;
    } catch {
      payload = null;
    }
    destinationPayloads.push(payload);
  });
  page.on('request', (request) => {
    if (!request.url().includes('/api/preferences/notifications')) return;
    if (request.method() !== 'PUT') return;
    let payload: Record<string, unknown> | null = null;
    try {
      payload = request.postDataJSON() as Record<string, unknown>;
    } catch {
      payload = null;
    }
    preferencePayloads.push(payload);
  });
  page.on('response', (response) => {
    if (!response.url().includes('/api/notifications/destinations')) return;
    destinationStatuses.push(response.status());
  });
  page.on('response', (response) => {
    if (!response.url().includes('/api/preferences/notifications')) return;
    if (response.request().method() !== 'PUT') return;
    preferenceStatuses.push(response.status());
  });

  const prefsResponsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/preferences/notifications')
    && response.request().method() === 'GET'
  ), { timeout: 20000 });
  await page.goto('/settings/notifications');
  await waitForToken(page);

  const prefsResponse = await prefsResponsePromise;
  const prefsPayload = await prefsResponse.json() as { data?: Record<string, unknown> };
  const prefs = prefsPayload?.data ?? {};

  if (options.waitForOneSignal) {
    await page.waitForFunction(() => {
      const sdk = (window as any).OneSignal;
      return Boolean(sdk && typeof sdk.init === 'function' && sdk.Notifications);
    }, undefined, { timeout: 20000 });
  }

  return {
    baseURL,
    context,
    page,
    destinationPayloads,
    destinationStatuses,
    preferencePayloads,
    preferenceStatuses,
    prefs
  };
};

test.describe('Notification settings', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial' });

  test('updates notification preferences', async () => {
    if (!e2eConfig) return;
    test.setTimeout(120000);

    const headless = test.info().project.use.headless ?? true;
    const {
      context,
      page,
      preferencePayloads,
      preferenceStatuses,
      prefs
    } = await setupNotificationPage({ headless, userDataSuffix: 'prefs' });

    expect(prefs).toHaveProperty('messages_push');

    const paymentsRow = getSettingRow(page, 'Payments');
    await paymentsRow.getByRole('button').click();
    await page.getByRole('menuitemcheckbox', { name: 'Push' }).click();
    await expect.poll(
      () => preferencePayloads.some((payload) => Boolean(payload && 'payments_push' in payload)),
      { timeout: 15000 }
    ).toBeTruthy();

    const mentionsRow = getSettingRow(page, 'Mentions only');
    await mentionsRow.locator('button[aria-pressed]').click();
    await expect.poll(
      () => preferencePayloads.some((payload) => Boolean(payload && 'messages_mentions_only' in payload)),
      { timeout: 15000 }
    ).toBeTruthy();

    await expect.poll(
      () => preferenceStatuses.some((status) => status >= 200 && status < 300),
      { timeout: 15000 }
    ).toBeTruthy();
    await context.close();
  });

  test('registers OneSignal desktop destination', async () => {
    if (!e2eConfig) return;
    test.setTimeout(120000);

    const headless = test.info().project.use.headless ?? true;
    test.skip(headless, 'OneSignal desktop registration requires headed mode (notifications are denied in headless).');

    const {
      context,
      page,
      destinationPayloads,
      destinationStatuses,
      preferencePayloads,
      preferenceStatuses,
      prefs
    } = await setupNotificationPage({ headless, userDataSuffix: 'onesignal', waitForOneSignal: true });

    expect(prefs).toHaveProperty('messages_push');

    const notificationSupport = await page.evaluate(() => ({
      supported: 'Notification' in window,
      permission: Notification.permission
    }));
    expect(notificationSupport.supported).toBeTruthy();
    expect(notificationSupport.permission, 'Notifications must be granted for OneSignal registration.').toBe('granted');

    const desktopRow = getSettingRow(page, 'Desktop notifications');
    const desktopToggle = desktopRow.getByRole('button', { name: 'Toggle switch' });
    await expect(desktopToggle).not.toBeDisabled();
    const desktopPressedBefore = await desktopToggle.getAttribute('aria-pressed');
    if (desktopPressedBefore !== 'true') {
      await desktopToggle.click();
      await expect(desktopToggle).toHaveAttribute('aria-pressed', 'true');
    }

    await expect.poll(
      () => preferencePayloads.some((payload) => Boolean(payload && 'desktop_push_enabled' in payload)),
      { timeout: 15000 }
    ).toBeTruthy();
    await expect.poll(
      () => preferenceStatuses.some((status) => status >= 200 && status < 300),
      { timeout: 15000 }
    ).toBeTruthy();

    await expect.poll(
      () => destinationPayloads.length,
      { timeout: 30000 }
    ).toBeGreaterThan(0);
    await expect.poll(
      () => destinationStatuses.some((status) => status >= 200 && status < 300),
      { timeout: 30000 }
    ).toBeTruthy();
    const destinationPayload = destinationPayloads.find(Boolean) ?? null;
    expect(destinationPayload).toMatchObject({
      platform: 'web'
    });
    expect(typeof destinationPayload?.onesignalId).toBe('string');

    await context.close();
  });
});
