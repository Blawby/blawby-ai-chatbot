import { Page, expect } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

/**
 * Creates a test user via the UI signup flow (navigates to /auth and fills/submits the signup form)
 * Returns the user credentials; leaves authentication in the current page context
 * Note: This function uses the UI form, not direct API calls
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
  await page.click('[data-testid="auth-toggle-signup"]');

  // Fill signup form
  await page.fill('[data-testid="signup-name-input"]', user.name);
  await page.fill('[data-testid="signup-email-input"]', user.email);
  await page.fill('[data-testid="signup-password-input"]', user.password);
  await page.fill('[data-testid="signup-confirm-password-input"]', user.password);

  // Submit form
  await page.click('[data-testid="signup-submit-button"]');
  
  // Wait for success message or redirect (like auth.spec.ts does - simple and reliable)
  await Promise.race([
    page.waitForURL('/', { timeout: 25000 }).catch(() => {}),
    page.waitForSelector('text=/Account created|Welcome|signed in/i', { timeout: 25000 }).catch(() => {})
  ]);
  
  // Wait for network to settle (like auth.spec.ts does)
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  
  // Verify session is established
  {
    let authenticated = false;
    for (let i = 0; i < 10; i++) {
      const sessionCheck: any = await page.evaluate(async () => {
        try {
          const res = await fetch('/api/auth/get-session', { credentials: 'include' });
          if (!res.ok) return null;
          const data: any = await res.json();
          return data?.session ?? null;
        } catch {
          return null;
        }
      });
      if (sessionCheck) { authenticated = true; break; }
      await page.waitForTimeout(300);
    }
  }
  
  // Navigate to home page manually if still on auth page (like auth.spec.ts does)
  if (page.url().includes('/auth')) {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }
  
  // Dismiss welcome modal if it appears (like auth.spec.ts does)
  try {
    const welcomeModalButton = page.getByRole('button', { name: /Okay, let's go/i });
    await expect(welcomeModalButton).toBeVisible({ timeout: 5000 });
    await welcomeModalButton.click();
    await page.waitForTimeout(500); // Wait for modal to close
  } catch {
    // Welcome modal might not appear, that's okay
  }

  return user;
}

/**
 * Ensures the page is authenticated by creating a test user if not already authenticated
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  // Check if already authenticated by checking session
  const sessionCheck: any = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/get-session', { credentials: 'include' });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data?.session ?? null;
    } catch {
      return null;
    }
  });

  // If not authenticated, create a test user
  if (!sessionCheck) {
    await createTestUser(page);
  }
}

/**
 * Verifies that a user has a personal organization
 */
export async function verifyPersonalOrg(page: Page): Promise<void> {
  const orgsData: any = await page.evaluate(async () => {
    const res = await fetch('/api/organizations/me', { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  });

  expect(orgsData).toBeDefined();
  expect(orgsData?.success).toBe(true);
  expect(Array.isArray(orgsData?.data)).toBe(true);
  expect(orgsData?.data?.length).toBeGreaterThan(0);

  const personalOrg = orgsData?.data?.find((org: { kind?: string }) => org.kind === 'personal');
  expect(personalOrg).toBeDefined();
  expect(personalOrg?.kind).toBe('personal');
  expect(personalOrg?.subscriptionStatus).toBe('none');
}
