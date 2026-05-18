import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolveBaseUrl } from './helpers/baseUrl';
import { attachNetworkLogger } from './helpers/networkLogger';

type PublicE2EFixtures = {
  unauthContext: BrowserContext;
  anonPage: Page;
};

type PublicWorkerFixtures = {
  anonContext: BrowserContext;
};

const EMPTY_STATE = { cookies: [], origins: [] };

const test = base.extend<PublicE2EFixtures, PublicWorkerFixtures>({
  anonContext: [async ({ browser }, use, workerInfo) => {
    const baseURL = resolveBaseUrl(workerInfo.project.use.baseURL as string | undefined);
    const context = await browser.newContext({
      baseURL,
      storageState: EMPTY_STATE,
      extraHTTPHeaders: { Cookie: '' }
    });
    await use(context);
    await context.close();
  }, { scope: 'worker' }],
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
  anonPage: async ({ anonContext }, use, testInfo) => {
    const page = await anonContext.newPage();
    const baseURL = resolveBaseUrl(testInfo.project.use.baseURL as string | undefined);
    const networkLogger = attachNetworkLogger({ context: anonContext, testInfo, label: 'public-anon', baseURL });
    await use(page);
    await networkLogger?.flush();
    await page.close();
  }
});

export { expect, test };
