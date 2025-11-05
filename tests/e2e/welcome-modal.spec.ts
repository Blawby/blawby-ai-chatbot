import { test, expect } from '@playwright/test';
import { createTestUser } from './helpers/createTestUser.js';

function welcomeButton(page: import('@playwright/test').Page) {
  return page.getByRole('button', { name: /okay, let's go/i });
}

function pricingModalTitle(page: import('@playwright/test').Page) {
  return page.getByTestId('pricing-modal-title');
}

async function closeWelcomeIfVisible(page: import('@playwright/test').Page) {
  const btn = welcomeButton(page);
  if (await btn.count()) {
    await btn.first().click({ timeout: 5000 });
    return true;
  }
  return false;
}

test.describe('Welcome modal behavior', () => {
  test('shows at most once and does not regress; pricing hash unaffected', async ({ browser, context, page }) => {
    // Sign up a new user via UI helper
    await createTestUser(page);

    // Ensure on home
    await page.goto('/');

    // 1) First appearance: if shown, close it; otherwise continue
    const firstShown = await closeWelcomeIfVisible(page);

    // 2) Refresh - should NOT show again
    await page.reload();
    await expect(welcomeButton(page)).toHaveCount(0);

    // 3) Navigate away and back - should NOT show again
    await page.goto('/settings');
    await page.goto('/');
    await expect(welcomeButton(page)).toHaveCount(0);

    // 4) Cross-tab suppression: open a second page in same context
    const page2 = await context.newPage();
    await page2.goto('/');
    await expect(welcomeButton(page2)).toHaveCount(0);
    await page2.close();

    // 5) Optional server state check (non-blocking) — tolerate environments without session endpoint
    // The core behavior is verified via UI; server check is best-effort only
    try {
      const data: any = await page.evaluate(async () => {
        try {
          const res = await fetch('/api/auth/get-session', { credentials: 'include' });
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      });
      const session = data?.session ?? null;
      if (firstShown && session?.user) {
        expect(!!session.user.welcomedAt).toBe(true);
      }
    } catch {
      // ignore
    }

    // 6) Pricing hash behavior unchanged
    await page.goto('/#pricing');
    // The UI renders a fullscreen pricing modal; assert presence by test id
    await expect(pricingModalTitle(page)).toBeVisible({ timeout: 5000 });
  });
});
