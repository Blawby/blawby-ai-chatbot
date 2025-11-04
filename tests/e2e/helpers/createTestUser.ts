import { Page, expect } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

/**
 * Creates a test user via the signup API endpoint
 * Returns the user credentials and saves the storage state
 */
export async function createTestUser(
  page: Page,
  options: {
    email?: string;
    password?: string;
    name?: string;
  } = {}
): Promise<TestUser> {
  const timestamp = Date.now();
  const user: TestUser = {
    email: options.email || `e2e-test-${timestamp}@example.com`,
    password: options.password || 'TestPassword123!',
    name: options.name || 'E2E Test User',
  };

  // Set localStorage flags to avoid onboarding redirects
  await page.addInitScript(() => {
    try {
      localStorage.setItem('onboardingCompleted', 'true');
      localStorage.setItem('onboardingCheckDone', 'true');
    } catch {}
  });

  // Navigate to auth page
  await page.goto('/auth');

  // Click sign up toggle
  await page.click('text=Don\'t have an account? Sign up');

  // Fill signup form
  await page.fill('input[placeholder="Enter your email"]', user.email);
  await page.fill('input[placeholder="Enter your full name"]', user.name);
  await page.fill('input[placeholder="Enter your password"]', user.password);
  await page.fill('input[placeholder="Confirm your password"]', user.password);

  // Submit form
  await page.click('button:has-text("Create account")');

  // Wait for success message or redirect
  await Promise.race([
    page.waitForURL('/', { timeout: 15000 }),
    page.waitForSelector('text=/Account created|Welcome|signed in/i', { timeout: 15000 }),
  ]);

  // Navigate to home page if still on auth page
  if (page.url().includes('/auth')) {
    await page.goto('/');
  }

  // Dismiss welcome modal if it appears
  const welcomeModalButton = page.getByRole('button', { name: /Okay, let's go/i });
  try {
    await expect(welcomeModalButton).toBeVisible({ timeout: 2000 });
    await welcomeModalButton.click();
  } catch {
    // Modal might not appear, that's okay
  }

  return user;
}

/**
 * Verifies that a user has a personal organization
 */
export async function verifyPersonalOrg(page: Page): Promise<void> {
  const orgsData = await page.evaluate(async () => {
    const res = await fetch('/api/organizations/me', { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  });

  expect(orgsData).toBeDefined();
  expect(orgsData?.success).toBe(true);
  expect(Array.isArray(orgsData?.data)).toBe(true);
  expect(orgsData?.data?.length).toBeGreaterThan(0);

  const personalOrg = orgsData?.data?.find((org: { isPersonal: boolean }) => org.isPersonal);
  expect(personalOrg).toBeDefined();
  expect(personalOrg?.kind).toBe('personal');
  expect(personalOrg?.subscriptionStatus).toBe('none');
}
