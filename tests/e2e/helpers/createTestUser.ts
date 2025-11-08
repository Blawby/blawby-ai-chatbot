import { Page, expect } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  name: string;
  organizationId?: string; // Included when upgradeToBusiness is true
}

/**
 * Creates a test user via the UI signup flow (navigates to /auth and fills/submits the signup form)
 * Returns the user credentials; leaves authentication in the current page context
 * Note: This function uses the UI form, not direct API calls
 * 
 * @param upgradeToBusiness - If true, upgrades the user's personal organization to business tier via test endpoint
 */
export async function createTestUser(
  page: Page,
  options: {
    email?: string;
    password?: string;
    name?: string;
    upgradeToBusiness?: boolean;
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
  
  // Give the auth system a brief moment to finalize session cookies before polling
  await page.waitForTimeout(1200);
  
  // Verify session is established
  {
    let authenticated = false;
    const attempts = 30;
    for (let i = 0; i < attempts; i++) {
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
      await page.waitForTimeout(500);
    }
    if (!authenticated) {
      // Throw to fail fast if session wasn't established
      throw new Error(`Authentication not established after ${attempts} attempts`);
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

  // Optionally upgrade organization to business tier
  if (options.upgradeToBusiness) {
    try {
      // Get user's personal organization
      const orgsData: any = await page.evaluate(async () => {
        const res = await fetch('/api/organizations/me', { credentials: 'include' });
        if (!res.ok) return null;
        return await res.json();
      });

      const personalOrg = orgsData?.data?.find(
        (org: { kind?: string; isPersonal?: boolean }) =>
          org.kind === 'personal' || org.isPersonal === true
      );

      if (personalOrg?.id) {
        // Convert organization to business tier via test endpoint
        const convertResponse: any = await page.evaluate(async (orgId: string) => {
          const res = await fetch('/api/test/convert-org-to-business', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizationId: orgId }),
          });
          if (!res.ok) {
            const errorText = await res.text();
            return { success: false, error: errorText, status: res.status };
          }
          return await res.json();
        }, personalOrg.id);

        if (convertResponse?.success) {
          user.organizationId = personalOrg.id;
          // Reload the page to force hooks to refetch organization data
          await page.reload({ waitUntil: 'networkidle' });
          
          // Wait for the organization to be fetched and verified as business tier
          // Poll until the API returns business tier (up to 5 seconds)
          let verified = false;
          for (let i = 0; i < 10; i++) {
            const orgsCheck: any = await page.evaluate(async () => {
              const res = await fetch('/api/organizations/me', { credentials: 'include' });
              if (!res.ok) return null;
              return await res.json();
            });
            
            const upgradedOrg = orgsCheck?.data?.find((org: { id: string }) => org.id === personalOrg.id);
            if (upgradedOrg?.kind === 'business' && upgradedOrg?.subscriptionStatus === 'active') {
              verified = true;
              break;
            }
            await page.waitForTimeout(500);
          }
          
          if (!verified) {
            console.warn('[TEST] Organization upgrade verified but status may not be fully propagated');
          }
        } else {
          console.warn('[TEST] Failed to upgrade org to business:', convertResponse?.error || convertResponse?.status);
        }
      }
    } catch (error) {
      console.warn('[TEST] Error upgrading org to business:', error);
    }
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
