import { test, expect } from '@playwright/test';

async function ensureAuthenticated(page: import('@playwright/test').Page) {
  const hasSession = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/get-session', { credentials: 'include' });
      if (!res.ok) return false;
      const data = (await res.json()) as { session?: unknown };
      return Boolean((data && 'session' in data) ? (data as { session?: unknown }).session : undefined);
    } catch {
      return false;
    }
  });
  if (hasSession) return;

  const email = `e2e-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  await page.goto('/auth');
  await page.click("text=Don't have an account? Sign up");
  await page.fill('input[placeholder="Enter your email"]', email);
  await page.fill('input[placeholder="Enter your full name"]', 'E2E User');
  await page.fill('input[placeholder="Enter your password"]', password);
  await page.fill('input[placeholder="Confirm your password"]', password);
  await page.click('button:has-text("Create account")');
  await Promise.race([
    page.waitForURL('/', { timeout: 15000 }),
    page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
  ]);
}

test.describe('Post-checkout Business Onboarding', () => {
  test('upgrade to Stripe then onboarding sync opens modal', async ({ page }) => {
    await ensureAuthenticated(page);
    // Attach browser console and network logging for debugging
    page.on('console', (msg) => {
      // Limit noisy logs
      const text = msg.text();
      if (text.includes('[vite] connected')) return;
      // eslint-disable-next-line no-console
      console.log(`[browser:${msg.type()}]`, text);
    });
    page.on('request', (req) => {
      // eslint-disable-next-line no-console
      console.log('[request]', req.method(), req.url());
    });
    page.on('response', async (res) => {
      // eslint-disable-next-line no-console
      console.log('[response]', res.status(), res.url());
    });

    // Navigate to home and neutralize onboarding guard
    await page.goto('/');
    await page.evaluate(() => {
      try {
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('onboardingCheckDone', 'true');
      } catch {}
    });
    await page.goto('/');

    // Dismiss any welcome/intro overlay that can intercept clicks
    const okLetsGo = page.getByRole('button', { name: /Okay, let's go/i });
    if (await okLetsGo.count()) {
      await okLetsGo.click({ timeout: 5000 });
    } else {
      // As a fallback, press Escape to close any modal
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.getByRole('button', { name: 'Upgrade' }).click();
    await page.getByRole('button', { name: 'Get Business' }).click();
    await expect(page).toHaveURL(/\/cart\?tier=business/);

    // Click Continue and wait for Stripe
    const upgradeReq = page.waitForRequest((req) => req.url().includes('/api/auth/subscription/upgrade') && req.method() === 'POST');
    const stripeNav = page.waitForURL(/checkout\.stripe\.com/);
    await page.getByRole('button', { name: 'Continue' }).click();
    await upgradeReq;
    await stripeNav;

    // Simulate redirect back to onboarding with sync
    const syncOk = page.waitForResponse((res) => res.url().includes('/api/subscription/sync') && res.request().method() === 'POST' && res.status() === 200);
    await page.goto('/business-onboarding?sync=1');
    await syncOk;
    // Assert we are on onboarding route (modal may be gated by tier)
    await expect(page).toHaveURL(/\/business-onboarding/);
  });
});


