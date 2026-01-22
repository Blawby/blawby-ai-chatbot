import { chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { expect, test } from './fixtures';
import { waitForSession } from './helpers/auth';
import { AUTH_STATE_PATHS } from './helpers/authState';
import { resolveBaseUrl } from './helpers/baseUrl';
import { loadE2EConfig } from './helpers/e2eConfig';
import { attachNetworkLogger } from './helpers/networkLogger';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const e2eConfig = loadE2EConfig();

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

const applyStorageState = async (context: BrowserContext, baseURL: string, storagePath: string): Promise<void> => {
  if (!existsSync(storagePath)) return;
  let state: StorageState | null = null;
  try {
    state = JSON.parse(readFileSync(storagePath, 'utf-8')) as StorageState;
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
  flushNetworkLogs?: () => Promise<void>;
};

const setNotificationPreferences = async (
  page: Page,
  baseURL: string,
  data: Record<string, unknown>
): Promise<void> => {
  const response = await page.request.put(`${baseURL}/api/preferences/notifications`, { data });
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to seed notification preferences (${response.status()}): ${text}`);
  }
};

const waitForOneSignalReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const sdk = (window as any).OneSignal;
    return Boolean(sdk && typeof sdk.init === 'function' && sdk.Notifications);
  }, undefined, { timeout: 20000 });
};

const setupNotificationPage = async (options: {
  headless: boolean;
  userDataSuffix: string;
  testInfo: TestInfo;
  initialPreferences?: Record<string, unknown>;
}): Promise<NotificationSetup> => {
  const baseURL = resolveBaseUrl(options.testInfo.project.use.baseURL as string | undefined);
  const origin = new URL(baseURL).origin;
  const userDataDir = options.testInfo.outputPath(`notifications-profile-${options.userDataSuffix}`);

  ensureNotificationsAllowed(userDataDir, origin);
  const context = await chromium.launchPersistentContext(userDataDir, {
    baseURL,
    permissions: ['notifications'],
    headless: options.headless,
    ignoreDefaultArgs: ['--disable-notifications']
  });
  await context.grantPermissions(['notifications'], { origin });
  await applyStorageState(context, baseURL, AUTH_STATE_PATHS.owner);
  const networkLogger = attachNetworkLogger({
    context,
    testInfo: options.testInfo,
    label: `notifications-${options.userDataSuffix}`,
    baseURL
  });

  const page = await context.newPage();
  if (options.initialPreferences) {
    await setNotificationPreferences(page, baseURL, options.initialPreferences);
  }

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
  await waitForSession(page);

  const prefsResponse = await prefsResponsePromise;
  const prefsPayload = await prefsResponse.json() as Record<string, unknown> | { data?: Record<string, unknown> };
  const toRecord = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  );
  const prefs = (prefsPayload && typeof prefsPayload === 'object' && 'data' in prefsPayload && prefsPayload.data)
    ? toRecord(prefsPayload.data)
    : toRecord(prefsPayload);

  return {
    baseURL,
    context,
    page,
    destinationPayloads,
    destinationStatuses,
    preferencePayloads,
    preferenceStatuses,
    prefs,
    flushNetworkLogs: networkLogger?.flush
  };
};

test.describe('Notification settings', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial' });

  test('updates notification preferences', async ({ browserName: _browserName }, testInfo) => {
    if (!e2eConfig) return;
    test.setTimeout(120000);

    const headless = testInfo.project.use.headless ?? true;
    const {
      context,
      page,
      preferencePayloads,
      preferenceStatuses,
      prefs,
      flushNetworkLogs
    } = await setupNotificationPage({ headless, userDataSuffix: 'prefs', testInfo });

    try {
      expect(prefs).toHaveProperty('messages_push');

      const initialPreferenceCount = preferencePayloads.length;
      const initialPreferenceStatusCount = preferenceStatuses.length;

      const paymentsRow = getSettingRow(page, 'Payments');
      await paymentsRow.getByRole('button').click();
      await page.getByRole('menuitemcheckbox', { name: 'Push' }).click();
      await expect.poll(
        () => preferencePayloads
          .slice(initialPreferenceCount)
          .some((payload) => Boolean(payload && 'payments_push' in payload)),
        { timeout: 15000 }
      ).toBeTruthy();

      const mentionsRow = getSettingRow(page, 'Mentions only');
      await mentionsRow.locator('button[aria-pressed]').click();
      await expect.poll(
        () => preferencePayloads
          .slice(initialPreferenceCount)
          .some((payload) => Boolean(payload && 'messages_mentions_only' in payload)),
        { timeout: 15000 }
      ).toBeTruthy();

      const inAppPaymentsRow = getSettingRow(page, 'Payments (in-app)');
      await inAppPaymentsRow.locator('button[aria-pressed]').click();
      await expect.poll(
        () => preferencePayloads
          .slice(initialPreferenceCount)
          .some((payload) => Boolean(payload && 'in_app_payments' in payload)),
        { timeout: 15000 }
      ).toBeTruthy();

      const summariesRow = getSettingRow(page, 'System summaries only');
      await summariesRow.locator('button[aria-pressed]').click();
      await expect.poll(
        () => preferencePayloads
          .slice(initialPreferenceCount)
          .some((payload) => Boolean(payload && 'in_app_frequency' in payload)),
        { timeout: 15000 }
      ).toBeTruthy();

      await expect.poll(
        () => preferenceStatuses.length > initialPreferenceStatusCount
          && preferenceStatuses.some((status) => status >= 200 && status < 300),
        { timeout: 15000 }
      ).toBeTruthy();
    } finally {
      await flushNetworkLogs?.();
      await context.close();
    }
  });

  test('registers OneSignal desktop destination', async ({ browserName: _browserName }, testInfo) => {
    if (!e2eConfig) return;
    test.setTimeout(120000);

    const headless = testInfo.project.use.headless ?? true;
    test.skip(headless, 'OneSignal desktop registration requires headed mode (notifications are denied in headless).');

    const {
      context,
      page,
      destinationPayloads,
      destinationStatuses,
      preferencePayloads,
      preferenceStatuses,
      prefs,
      flushNetworkLogs
    } = await setupNotificationPage({
      headless,
      userDataSuffix: 'onesignal',
      testInfo,
      initialPreferences: { desktop_push_enabled: false }
    });

    try {
      await waitForOneSignalReady(page);

      expect(prefs).toHaveProperty('messages_push');

      const notificationSupport = await page.evaluate(() => ({
        supported: 'Notification' in window,
        permission: Notification.permission
      }));
      expect(notificationSupport.supported).toBeTruthy();
      expect(notificationSupport.permission, 'Notifications must be granted for OneSignal registration.').toBe('granted');

      const initialDestinationCount = destinationPayloads.length;
      const initialDestinationStatusCount = destinationStatuses.length;
      const initialPreferenceCount = preferencePayloads.length;
      const initialPreferenceStatusCount = preferenceStatuses.length;

      const desktopRow = getSettingRow(page, 'Desktop notifications');
      const desktopToggle = desktopRow.getByRole('button', { name: 'Toggle switch' });
      await expect(desktopToggle).not.toBeDisabled();
      await desktopToggle.click();

      await expect.poll(
        () => preferencePayloads
          .slice(initialPreferenceCount)
          .some((payload) => Boolean(payload && 'desktop_push_enabled' in payload)),
        { timeout: 15000 }
      ).toBeTruthy();
      await expect.poll(
        () => preferenceStatuses.length > initialPreferenceStatusCount
          && preferenceStatuses.some((status) => status >= 200 && status < 300),
        { timeout: 15000 }
      ).toBeTruthy();

      await expect.poll(
        () => destinationPayloads.length,
        { timeout: 30000 }
      ).toBeGreaterThan(initialDestinationCount);
      await expect.poll(
        () => destinationStatuses.length > initialDestinationStatusCount
          && destinationStatuses.some((status) => status >= 200 && status < 300),
        { timeout: 30000 }
      ).toBeTruthy();
      const destinationPayload = destinationPayloads.find(Boolean) ?? null;
      expect(destinationPayload).toMatchObject({
        platform: 'web'
      });
      expect(typeof destinationPayload?.onesignalId).toBe('string');
    } finally {
      await flushNetworkLogs?.();
      await context.close();
    }
  });
});
