import { test, expect, type Page } from '@playwright/test';

test.describe('Better Auth Integration', () => {

  async function fetchJsonViaPage(page: Page, url: string, init?: any): Promise<{ status: number; data?: any; error?: string }> {
    // Use relative URLs so they go through Vite proxy (which forwards to worker)
    // The page context (localhost:5173) will proxy /api/* to localhost:8787
    return page.evaluate(async ({ url, init }: any) => {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          ...init,
        });
        if (!response.ok) {
          const text = await response.text();
          return { status: response.status, error: `HTTP ${response.status}: ${text}` };
        }
        const data = await response.json();
        return { status: response.status, data };
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }, { url, init });
  }

  async function waitForSessionState(
    page: Page,
    predicate: (result: { status: number; data?: any; error?: string }) => boolean,
    timeoutMs = 5000,
    pollIntervalMs = 200
  ) {
    const start = Date.now();
    let lastResult = await fetchJsonViaPage(page, '/api/auth/get-session');
    while (!predicate(lastResult) && Date.now() - start < timeoutMs) {
      await page.waitForTimeout(pollIntervalMs);
      lastResult = await fetchJsonViaPage(page, '/api/auth/get-session');
    }
    return lastResult;
  }

  test('should allow anonymous chat', async ({ page }) => {
    await page.goto('/');
    
    // Wait for chat interface to load
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible();
    
    // Send a message without authentication
    await page.fill('[data-testid="message-input"]', 'Hello, I need legal help');
    await page.click('button[type="submit"]');
    
    // Verify message appears
    await expect(page.locator('text=Hello, I need legal help')).toBeVisible();
  });

  test('should sign up with email/password', async ({ page }) => {
    await page.goto('/auth');
    
    // Click sign up toggle button
    await page.click('[data-testid="auth-toggle-signup"]');
    
    // Fill signup form
    const testEmail = `test-${Date.now()}@example.com`;
    await page.fill('[data-testid="signup-name-input"]', 'Test User');
    await page.fill('[data-testid="signup-email-input"]', testEmail);
    await page.fill('[data-testid="signup-password-input"]', 'TestPassword123!');
    await page.fill('[data-testid="signup-confirm-password-input"]', 'TestPassword123!');
    
    // Submit form
    await page.click('[data-testid="signup-submit-button"]');
    
    // Verify account created
    await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });
    
    // Verify personal organization was created via /api/organizations/me
    // This works regardless of storage backend and mirrors how the UI reads state
    const orgsData: any = await page.evaluate(async () => {
      const res = await fetch('/api/organizations/me', { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    });
    
    expect(orgsData).toBeDefined();
    expect(orgsData?.success).toBe(true);
    expect(Array.isArray(orgsData?.data)).toBe(true);
    
    // Assert exactly one organization exists with correct properties
    expect(orgsData?.data?.length).toBe(1);
    
    const personalOrg = orgsData?.data?.[0];
    expect(personalOrg).toBeDefined();
    expect(personalOrg?.kind).toBe('personal');
    expect(personalOrg?.subscriptionStatus).toBe('none');
    
    // Note: Better Auth's organization plugin doesn't automatically set an active org after signup
    // The upgrade flow will set it when needed via authClient.organization.setActive()
    // For now, we just verify the personal org exists (already done above)
    // The active organization will be set during the checkout/upgrade flow
  });

  test('should sign in with existing account', async ({ page, browser }) => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    await page.goto('/auth');
    await page.click('[data-testid="auth-toggle-signup"]');
    await page.fill('[data-testid="signup-email-input"]', testEmail);
    await page.fill('[data-testid="signup-name-input"]', 'Test User');
    await page.fill('[data-testid="signup-password-input"]', testPassword);
    await page.fill('[data-testid="signup-confirm-password-input"]', testPassword);
    await page.click('[data-testid="signup-submit-button"]');

    await Promise.race([
      page.waitForURL('/', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome|signed in/i', { timeout: 15000 })
    ]);
    await page.waitForLoadState('networkidle');

    const returningContext = await browser.newContext();
    const returningPage = await returningContext.newPage();
    await returningPage.goto('/auth');

    const sessionBeforeSignin = await fetchJsonViaPage(returningPage, '/api/auth/get-session');
    if (sessionBeforeSignin.status === 200) {
      expect(sessionBeforeSignin.data?.session ?? null).toBeNull();
    } else {
      expect([0, 401]).toContain(sessionBeforeSignin.status);
    }

    await returningPage.fill('[data-testid="signin-email-input"]', testEmail);
    await returningPage.fill('[data-testid="signin-password-input"]', testPassword);
    await returningPage.click('[data-testid="signin-submit-button"]');

    await Promise.race([
      returningPage.waitForURL('/', { timeout: 15000 }),
      returningPage.waitForSelector('text=/Account created|Welcome|signed in/i', { timeout: 15000 })
    ]);
    await returningPage.waitForLoadState('networkidle');

    const sessionAfterSignin = await waitForSessionState(
      returningPage,
      (result) => result.status === 200 && Boolean(result.data?.session),
      7000,
      250
    );
    if (sessionAfterSignin.status !== 200 || !sessionAfterSignin.data?.session) {
      throw new Error(`Session not ready after sign-in: ${JSON.stringify(sessionAfterSignin)}`);
    }

    let orgsResult = await fetchJsonViaPage(returningPage, '/api/organizations/me');
    if (orgsResult.status !== 200) {
      await returningPage.waitForTimeout(500);
      orgsResult = await fetchJsonViaPage(returningPage, '/api/organizations/me');
    }

    if (orgsResult.status !== 200 || !orgsResult.data?.success) {
      throw new Error(`Failed to fetch organizations after sign-in: ${orgsResult.error ?? orgsResult.status}`);
    }

    const personalOrg = orgsResult.data.data?.find((org: { kind?: string }) => org?.kind === 'personal');
    expect(personalOrg).toBeDefined();
    expect(personalOrg?.kind).toBe('personal');

    const signOutResult = await fetchJsonViaPage(returningPage, '/api/auth/sign-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    // Better Auth sign-out should normally return 200; 400 may indicate idempotent sign-out (already signed out)
    // Do NOT accept 0 (proxy/network) silently.
    expect([200, 400]).toContain(signOutResult.status);

    const sessionAfterSignOut = await waitForSessionState(
      returningPage,
      (result) => result.status !== 200 || !result.data?.session,
      7000,
      250
    );
    if (sessionAfterSignOut.status === 200) {
      expect(sessionAfterSignOut.data?.session ?? null).toBeNull();
    } else {
      expect([0, 401]).toContain(sessionAfterSignOut.status);
    }

    await returningContext.close();
  });

  test('should persist session on reload', async ({ page }) => {
    // Set localStorage flags before signup to avoid onboarding redirect
    await page.addInitScript(() => {
      try {
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('onboardingCheckDone', 'true');
      } catch {}
    });
    
    // Sign up
    const testEmail = `test-${Date.now()}@example.com`;
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your full name"]', 'Test User');
    await page.fill('input[placeholder="Enter your password"]', 'TestPassword123!');
    await page.fill('input[placeholder="Confirm your password"]', 'TestPassword123!');
    await page.click('button:has-text("Create account")');
    
    // Wait for success message or redirect
    await Promise.race([
      page.waitForURL('/', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);
    
    // Navigate to home page manually if still on auth page
    if (page.url().includes('/auth')) {
      await page.goto('/');
    }
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Reload page
    await page.reload({ waitUntil: 'networkidle' });
    
    // Verify still authenticated (should not be on auth page without onboarding params)
    // Allow auth page with onboarding params as that's a valid state
    const currentUrl = page.url();
    const isAuthPageWithOnboarding = currentUrl.includes('/auth') && currentUrl.includes('onboarding=true');
    if (!isAuthPageWithOnboarding) {
      await expect(page).not.toHaveURL(/\/auth/);
    }
    
    // Verify session still exists via API
    const sessionData: any = await page.evaluate(async () => {
      const res = await fetch('/api/auth/get-session', { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    });
    
    expect(sessionData?.session).not.toBeNull();
  });

  test('should allow chat after authentication', async ({ page }) => {
    // Start anonymous chat FIRST (before setting any flags that might trigger modals)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for message input to be ready
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    await expect(messageInput).toBeEnabled({ timeout: 5000 });
    
    await messageInput.fill('Anonymous message');
    
    // Wait for submit button to be enabled and click it
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();
    
    // Wait for message to appear
    await expect(page.locator('text=Anonymous message')).toBeVisible({ timeout: 10000 });
    
    // NOW sign up - set flags to avoid onboarding redirect AFTER we've done anonymous chat
    await page.evaluate(() => {
      try {
        localStorage.setItem('onboardingCheckDone', 'true');
      } catch {}
    });
    
    // Sign up
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    const testEmail = `test-${Date.now()}@example.com`;
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your full name"]', 'Test User');
    await page.fill('input[placeholder="Enter your password"]', 'TestPassword123!');
    await page.fill('input[placeholder="Confirm your password"]', 'TestPassword123!');
    await page.click('button:has-text("Create account")');
    
    // Wait for success message or redirect
    await Promise.race([
      page.waitForURL('/', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);
    
    // Navigate to home page manually if still on auth page
    if (page.url().includes('/auth')) {
      await page.goto('/');
    }
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle');
    
    // WelcomeModal appears when onboardingCompleted flag is set in localStorage
    // Wait for it and click "Okay, let's go" button to dismiss it
    const welcomeModalButton = page.getByRole('button', { name: /Okay, let's go/i });
    try {
      await expect(welcomeModalButton).toBeVisible({ timeout: 5000 });
      await welcomeModalButton.click();
      // Wait for modal to close
      await page.waitForTimeout(500);
    } catch {
      // Welcome modal might not appear, that's okay
    }
    
    // Wait for message input to be visible and enabled
    const postAuthMessageInput = page.locator('[data-testid="message-input"]');
    await expect(postAuthMessageInput).toBeVisible({ timeout: 20000 });
    await expect(postAuthMessageInput).toBeEnabled({ timeout: 5000 });
    
    // Clear any existing content and send a message after authentication
    await postAuthMessageInput.clear();
    await postAuthMessageInput.fill('Post-auth message');
    
    // Wait for submit button to be enabled and click it
    const postAuthSubmitButton = page.locator('button[type="submit"]');
    await expect(postAuthSubmitButton).toBeEnabled({ timeout: 5000 });
    await postAuthSubmitButton.click();
    
    // Verify the new message appears
    await expect(page.locator('text=Post-auth message')).toBeVisible({ timeout: 10000 });
  });
});
