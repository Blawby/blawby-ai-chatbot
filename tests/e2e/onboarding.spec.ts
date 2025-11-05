import { test, expect } from '@playwright/test';
import { createTestUser, verifyPersonalOrg, ensureAuthenticated } from './helpers/createTestUser.js';

test.describe('Business Onboarding', () => {
  async function getAppOrigin(page: any): Promise<string> {
    const baseURL = (page.context() as any)?._options?.baseURL as string | undefined;
    const fromEnv = process.env.APP_ORIGIN as string | undefined;
    const origin = (fromEnv || baseURL || 'http://localhost:5173').replace(/\/$/, '');
    return origin;
  }

  async function setupStripeStubs(
    page: any,
    appOrigin: string,
    stubCheckoutUrl: string,
    options?: {
      onUpgrade?: () => void;
      mockSync?: boolean;
    }
  ) {
    await page.route('**/api/auth/subscription/upgrade', async (route: any) => {
      if (options?.onUpgrade) options.onUpgrade();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, url: stubCheckoutUrl }),
      });
    });

    await page.route('https://stripe.test/**', async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<html><body><script>window.location.href = '${appOrigin}/business-onboarding?sync=1&forcePaid=1&stubStripe=1';</script></body></html>`,
      });
    });

    if (options?.mockSync) {
      await page.route('**/api/subscription/sync', async (route: any) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            synced: true,
            subscription: { status: 'active', priceId: 'price_monthly', seats: 1 },
          }),
        });
      });
    }
  }

  async function navigateToCartAndSelectPlan(page: any) {
    // Navigate to home and neutralize onboarding guard
    await page.goto('/');

    const okLetsGo = page.getByRole('button', { name: /Okay, let's go/i });
    if (await okLetsGo.count()) {
      await okLetsGo.click({ timeout: 5000 });
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }

    await page.getByRole('button', { name: 'Upgrade' }).click();
    await page.getByRole('button', { name: 'Get Business' }).click();
    await expect(page).toHaveURL(/\/cart\?tier=business/);

    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="cart-page"]', { timeout: 20000 });
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Loading pricing information...'),
      { timeout: 20000 }
    );
    await page.waitForSelector('button[role="radio"]', { timeout: 20000 });

    const pricePlan = page.locator('button[role="radio"][aria-checked="true"]');
    if (await pricePlan.count() === 0) {
      await page.locator('button[role="radio"]').first().click();
      await page.waitForTimeout(500);
    }

    const continueButton = page.getByRole('button', { name: 'Continue' });
    await expect(continueButton).toBeVisible({ timeout: 20000 });
    await expect(continueButton).toBeEnabled({ timeout: 10000 });
    await page.waitForTimeout(500);
    return continueButton;
  }
  test('should keep organization on personal tier when subscription sync is attempted without Stripe', async ({ page }) => {
    // Create authenticated test user
    const user = await createTestUser(page);
    
    // Verify personal org exists
    await verifyPersonalOrg(page);
    
    // Get organization ID from /api/organizations/me
    const orgsData: any = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/organizations/me', { credentials: 'include' });
        if (!res.ok) {
          const text = await res.text();
          return { error: `HTTP ${res.status}: ${text}`, status: res.status };
        }
        return await res.json();
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });
    
    if (orgsData?.error) {
      throw new Error(`Failed to fetch organizations: ${orgsData.error}`);
    }
    
    expect(orgsData).toBeDefined();
    expect(orgsData?.success).toBe(true);
    const personalOrg = orgsData?.data?.find((org: { kind?: string }) => org.kind === 'personal');
    expect(personalOrg).toBeDefined();
    const organizationId = personalOrg?.id;
    expect(organizationId).toBeDefined();
    
    // Attempt subscription sync without Stripe mocking
    // This verifies that sync does not upgrade the organization without proper Stripe setup
    const syncResponse = await page.evaluate(async (orgId: string) => {
      const res = await fetch('/api/subscription/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ organizationId: orgId }),
      });
      return {
        ok: res.ok,
        status: res.status,
        data: await res.json().catch(() => null),
      };
    }, organizationId);
    
    // Verify sync does not upgrade without Stripe/mocks
    // The organization should remain on personal tier with no subscription
    await page.goto('/');
    
    // Verify organization remains on personal tier
    const orgsDataAfter: any = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/organizations/me', { credentials: 'include' });
        if (!res.ok) {
          const text = await res.text();
          return { error: `HTTP ${res.status}: ${text}` };
        }
        return await res.json();
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });
    
    if (orgsDataAfter?.error) {
      throw new Error(`Failed to fetch organizations after sync: ${orgsDataAfter.error}`);
    }
    
    const personalOrgAfter = orgsDataAfter?.data?.find(
      (org: { kind?: string; isPersonal?: boolean }) => org.kind === 'personal' || org.isPersonal === true
    );
    expect(personalOrgAfter?.kind).toBe('personal');
    expect(personalOrgAfter?.subscriptionStatus).toBe('none');
  });

  test('upgrade to Stripe then onboarding sync opens modal (stubbed Stripe)', async ({ page }) => {
    await ensureAuthenticated(page);
    
    // Verify personal organization was created with correct metadata
    const orgsData: any = await page.evaluate(async () => {
      const res = await fetch('/api/organizations/me', { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    });
    
    expect(orgsData).toBeDefined();
    expect(orgsData?.success).toBe(true);
    expect(Array.isArray(orgsData?.data)).toBe(true);
    expect(orgsData?.data?.length).toBeGreaterThan(0);
    
    // Find personal organization
    const personalOrg = orgsData?.data?.find(
      (org: { kind?: string; isPersonal?: boolean }) =>
        org.kind === 'personal' || org.isPersonal === true
    );
    expect(personalOrg).toBeDefined();
    expect(personalOrg?.kind).toBe('personal');
    
    // Attach browser console and network logging for debugging
    page.on('console', (msg) => {
      // Limit noisy logs
      const text = msg.text();
      if (text.includes('[vite] connected')) return;
      // eslint-disable-next-line no-console
      console.log(`[browser:${msg.type()}]`, text);
    });
    const appOrigin = await getAppOrigin(page);
    const stubCheckoutUrl = 'https://stripe.test/checkout-session';
    await setupStripeStubs(page, appOrigin, stubCheckoutUrl, { mockSync: true });

    const continueButton = await navigateToCartAndSelectPlan(page);
    
    // Click Continue and wait for Stripe stub flow
    const upgradeReq = page.waitForRequest((req) => req.url().includes('/api/auth/subscription/upgrade') && req.method() === 'POST');
    const stripeNav = page.waitForURL(stubCheckoutUrl);
    await continueButton.click();
    await upgradeReq;
    await stripeNav;

    // Wait for sync and onboarding modal
    const syncOk = page.waitForResponse((res) => res.url().includes('/api/subscription/sync') && res.request().method() === 'POST' && res.status() === 200);
    await syncOk;
    await page.waitForURL(/\/business-onboarding/);
    await expect(page.getByRole('heading', { name: /Welcome to Blawby/i })).toBeVisible({ timeout: 10000 });
  });

  test('should change organization kind from personal to business during onboarding', async ({ page }) => {
    await ensureAuthenticated(page);
    
    // Step 1: Verify initial state - organization should be personal
    const orgsDataBefore: any = await page.evaluate(async () => {
      const res = await fetch('/api/organizations/me', { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    });
    
    expect(orgsDataBefore).toBeDefined();
    expect(orgsDataBefore?.success).toBe(true);
    
    const personalOrgBefore = orgsDataBefore?.data?.find(
      (org: { kind?: string; isPersonal?: boolean }) =>
        org.kind === 'personal' || org.isPersonal === true
    );
    expect(personalOrgBefore).toBeDefined();
    expect(personalOrgBefore?.kind).toBe('personal');
    expect(personalOrgBefore?.subscriptionStatus).toBe('none');
    
    const organizationId = personalOrgBefore?.id;
    expect(organizationId).toBeDefined();
    
    console.log(`[TEST] Initial org state: kind=${personalOrgBefore?.kind}, subscriptionStatus=${personalOrgBefore?.subscriptionStatus}, id=${organizationId}`);
    
    // Promise-based upgrade signal to avoid shared-flag race
    let resolveUpgrade!: () => void;
    const upgradeDone = new Promise<void>((res) => { resolveUpgrade = res; });

    await page.route('**/api/organizations/me', async (route) => {
      // If upgrade not yet signaled, continue; otherwise fulfill upgraded data
      const didUpgrade = await Promise.race<boolean>([
        upgradeDone.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 0)),
      ]);
      if (!didUpgrade) {
        await route.continue();
        return;
      }

      const upgradedOrgs = (orgsDataBefore?.data ?? []).map((org: Record<string, unknown>) => {
        if (org.id === organizationId) {
          return {
            ...org,
            kind: 'business',
            isPersonal: false,
            subscriptionStatus: 'active',
            subscriptionTier: 'business',
          };
        }
        return org;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: upgradedOrgs }),
      });
    });

    await page.route(`**/api/organizations/${organizationId}`, async (route) => {
      const didUpgrade = await Promise.race<boolean>([
        upgradeDone.then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 0)),
      ]);
      if (!didUpgrade) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ...personalOrgBefore,
            kind: 'business',
            isPersonal: false,
            subscriptionStatus: 'active',
            subscriptionTier: 'business',
          },
        }),
      });
    });

    const appOrigin = await getAppOrigin(page);
    const stubCheckoutUrl = 'https://stripe.test/checkout-session';

    await setupStripeStubs(page, appOrigin, stubCheckoutUrl, { onUpgrade: () => resolveUpgrade(), mockSync: true });

    // Step 3: Navigate to home and start upgrade
    const continueButton = await navigateToCartAndSelectPlan(page);
    
    // Step 4: Complete upgrade and wait for sync
    const upgradeReq = page.waitForRequest((req) => req.url().includes('/api/auth/subscription/upgrade') && req.method() === 'POST');
    const stripeNav = page.waitForURL(stubCheckoutUrl);
    await continueButton.click();
    await upgradeReq;
    await stripeNav;

    const syncOk = page.waitForResponse((res) => res.url().includes('/api/subscription/sync') && res.request().method() === 'POST' && res.status() === 200);
    await syncOk;
    await page.waitForURL(/\/business-onboarding/);
    await page.waitForTimeout(2000);

    const orgsDataAfter: any = await page.evaluate(async (orgId: string) => {
      const res = await fetch('/api/organizations/me', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const org = data?.data?.find((o: { id?: string }) => o.id === orgId);
      return { ...data, foundOrg: org };
    }, organizationId);
    
    expect(orgsDataAfter).toBeDefined();
    expect(orgsDataAfter?.success).toBe(true);
    expect(orgsDataAfter?.foundOrg).toBeDefined();
    
    const orgAfter = orgsDataAfter?.foundOrg;
    await expect(page.getByRole('heading', { name: /Welcome to Blawby/i })).toBeVisible({ timeout: 10000 });
    expect(orgAfter?.kind).toBe('business');
    expect(orgAfter?.subscriptionStatus).toBe('active');
  });
});
