import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { AUTH_STATE_PATHS } from './helpers/authState';
import { resolveBaseUrl } from './helpers/baseUrl';
import { attachNetworkLogger } from './helpers/networkLogger';

type E2EFixtures = {
  baseURL: string;
  ownerContext: BrowserContext;
  clientContext: BrowserContext;
  anonContext: BrowserContext;
  unauthContext: BrowserContext;
  ownerPage: Page;
  clientPage: Page;
  anonPage: Page;
};

const test = base.extend<E2EFixtures>({
  baseURL: async ({ browserName: _browserName }, use, testInfo) => {
    const baseURL = resolveBaseUrl(testInfo.project.use.baseURL as string | undefined);
    await use(baseURL);
  },
  ownerContext: async ({ browser, baseURL }, use, testInfo) => {
    const context = await browser.newContext({ storageState: AUTH_STATE_PATHS.owner, baseURL });
    const networkLogger = attachNetworkLogger({ context, testInfo, label: 'owner', baseURL });
    await use(context);
    await networkLogger?.flush();
    await context.close();
  },
  clientContext: async ({ browser, baseURL }, use, testInfo) => {
    const context = await browser.newContext({ storageState: AUTH_STATE_PATHS.client, baseURL });
    const networkLogger = attachNetworkLogger({ context, testInfo, label: 'client', baseURL });
    await use(context);
    await networkLogger?.flush();
    await context.close();
  },
  anonContext: async ({ browser, baseURL }, use, testInfo) => {
    const context = await browser.newContext({ storageState: AUTH_STATE_PATHS.anonymous, baseURL });
    const networkLogger = attachNetworkLogger({ context, testInfo, label: 'anonymous', baseURL });
    await use(context);
    await networkLogger?.flush();
    await context.close();
  },
  unauthContext: async ({ browser, baseURL }, use, testInfo) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { Cookie: '' }
    });
    const networkLogger = attachNetworkLogger({ context, testInfo, label: 'unauth', baseURL });
    await use(context);
    await networkLogger?.flush();
    await context.close();
  },
  ownerPage: async ({ ownerContext }, use) => {
    const page = await ownerContext.newPage();
    await use(page);
    await page.close();
  },
  clientPage: async ({ clientContext }, use) => {
    const page = await clientContext.newPage();
    await use(page);
    await page.close();
  },
  anonPage: async ({ anonContext }, use) => {
    const page = await anonContext.newPage();
    await use(page);
    await page.close();
  }
});

export { expect, test };
