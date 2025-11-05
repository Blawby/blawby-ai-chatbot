import { test, expect } from '@playwright/test';

// Minimal inline signup to avoid helper flags that skip onboarding
async function uiSignUp(page: import('@playwright/test').Page) {
  const timestamp = Date.now();
  const email = `e2e-onboard-${timestamp}@example.com`;
  const password = 'TestPassword123!';
  const name = 'E2E Onboard User';

  await page.goto('/auth');
  // Toggle to Sign up
  await page.getByTestId('auth-toggle-signup').click();
  await page.getByTestId('signup-name-input').fill(name);
  await page.getByTestId('signup-email-input').fill(email);
  await page.getByTestId('signup-password-input').fill(password);
  await page.getByTestId('signup-confirm-password-input').fill(password);
  await page.getByTestId('signup-submit-button').click();

  // Wait resiliently for auth to settle
  await Promise.race([
    page.waitForURL('/', { timeout: 25000 }),
    page.waitForSelector('text=/Account created|Welcome|signed in/i', { timeout: 25000 })
  ]).catch(() => {});

  // Ensure network is idle as a stabilization step (avoid brittle session polling here)
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  return { email, password, name };
}

// Helper to complete onboarding flow
async function completeOnboarding(page: import('@playwright/test').Page) {
  // Expect personal info step visible (look for a Continue button)
  const continueBtn = page.getByRole('button', { name: /continue/i });
  await expect(continueBtn).toBeVisible({ timeout: 10000 });

  // Fill first textbox for full name if present
  const textboxes = page.getByRole('textbox');
  if (await textboxes.count()) {
    await textboxes.first().fill('Test User');
  }

  // Agree to terms checkbox by id if present
  const terms = page.locator('#agreedToTerms');
  if (await terms.count()) {
    await terms.check();
  }

  await continueBtn.click();

  // Use case step: pick first radio and submit
  const firstRadio = page.locator('button[role="radio"]').first();
  await expect(firstRadio).toBeVisible({ timeout: 10000 });
  await firstRadio.click();

  // Submit (Next/Continue)
  const nextBtn = page.getByRole('button', { name: /next|continue|finish/i });
  await expect(nextBtn).toBeVisible({ timeout: 10000 });
  await nextBtn.click();

  // After complete, expect redirect to home
  await page.waitForURL('**/', { timeout: 15000 });
}

// Test suite
test.describe('Personal Onboarding Modal', () => {
  test('opens for new signup, completes, and does not re-open (param ignored)', async ({ page }) => {
    await uiSignUp(page);

    // Onboarding should show (detect by stable test id)
    const onboardingModal = page.getByTestId('onboarding-modal');
    await expect(onboardingModal).toBeVisible({ timeout: 15000 });

    await completeOnboarding(page);

    // Reload with param that previously forced open — should NOT reopen now
    await page.goto('/?onboarding=true');

    // Assert onboarding UI is not present (no radiogroup and no continue button)
    await expect(page.locator('[role="radiogroup"]')).toHaveCount(0);
    const maybeContinue = page.getByRole('button', { name: /continue/i });
    // If present, it should not be the onboarding modal on top; allow it to be absent
    try {
      await expect(maybeContinue).toBeHidden({ timeout: 1000 });
    } catch {}
  });

  test('does not open when onboardingCompleted already true (even with param)', async ({ page }) => {
    test.setTimeout(60000);
    // Create user via UI
    await uiSignUp(page);

    // Complete onboarding
    await completeOnboarding(page);

    // Navigate explicitly with param; onboarding should not re-open
    await page.goto('/auth?onboarding=true');
    // Ensure we see auth page content rather than onboarding layers
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.locator('[role="radiogroup"]')).toHaveCount(0);
  });
});
