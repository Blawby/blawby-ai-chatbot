import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolveBaseUrl } from './helpers/baseUrl';
import { attachNetworkLogger } from './helpers/networkLogger';

type PublicE2EFixtures = {
  baseURL: string;
  anonContext: BrowserContext;
  unauthContext: BrowserContext;
  anonPage: Page;
};

const EMPTY_STATE = { cookies: [], origins: [] };

const test = base.extend<PublicE2EFixtures>({
  baseURL: async ({ browserName: _browserName }, use, testInfo) => {
    const baseURL = resolveBaseUrl(testInfo.project.use.baseURL as string | undefined);
    await use(baseURL);
  },
  anonContext: async ({ browser, baseURL }, use, testInfo) => {
    const context = await browser.newContext({
      baseURL,
      storageState: EMPTY_STATE,
      extraHTTPHeaders: { Cookie: '' }
    });
    const networkLogger = attachNetworkLogger({ context, testInfo, label: 'public-anon', baseURL });
    await use(context);
    await networkLogger?.flush();
    await context.close();
  },
  unauthContext: async ({ browser, baseURL }, use, testInfo) => {
    const context = await browser.newContext({
      baseURL,
      storageState: EMPTY_STATE,
      extraHTTPHeaders: { Cookie: '' }
    });
    const networkLogger = attachNetworkLogger({ context, testInfo, label: 'public-unauth', baseURL });
    await use(context);
    await networkLogger?.flush();
    await context.close();
  },
  anonPage: async ({ anonContext }, use) => {
    const page = await anonContext.newPage();
    await use(page);
    await page.close();
  }
});

export { expect, test };
