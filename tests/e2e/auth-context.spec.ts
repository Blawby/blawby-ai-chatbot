import { test, expect } from '@playwright/test';
import { generateTestEmail, cleanupTestUser } from '../helpers/auth-cleanup';

test.describe('Auth Context Integration', () => {
  let testUsers: Array<{ email: string; token?: string }> = [];

  test.afterEach(async () => {
    // Cleanup test users
    for (const user of testUsers) {
      await cleanupTestUser(user.email, user.token);
    }
    testUsers = [];
  });

  test('should handle signup flow with real IndexedDB', async ({ page }) => {
    const testEmail = generateTestEmail('e2e-auth-context');
    
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Click sign up toggle
    await page.click('text=Don\'t have an account? Sign up');
    
    // Fill signup form
    await page.fill('input[placeholder*="email" i]', testEmail);
    await page.fill('input[placeholder*="first name" i]', 'Test');
    await page.fill('input[placeholder*="last name" i]', 'User');
    await page.fill('input[placeholder*="password" i]', 'TestPassword123!');
    await page.fill('input[placeholder*="confirm" i]', 'TestPassword123!');
    
    // Submit form
    await page.click('button:has-text("Create account")');
    
    // Wait for success
    await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });
    
    // Verify token is stored in IndexedDB
    const tokenInStorage = await page.evaluate(async () => {
      // Access real IndexedDB in browser
      return new Promise((resolve) => {
        const request = indexedDB.open('blawby-storage', 1);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          const getRequest = store.get('auth-token');
          getRequest.onsuccess = () => resolve(getRequest.result);
          getRequest.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      });
    });
    
    expect(tokenInStorage).toBeTruthy();
    
    // Track for cleanup
    testUsers.push({ email: testEmail });
  });

  test('should handle signin flow with session persistence', async ({ page }) => {
    const testEmail = generateTestEmail('e2e-auth-signin');
    
    // First create account
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder*="email" i]', testEmail);
    await page.fill('input[placeholder*="first name" i]', 'Test');
    await page.fill('input[placeholder*="last name" i]', 'User');
    await page.fill('input[placeholder*="password" i]', 'TestPassword123!');
    await page.fill('input[placeholder*="confirm" i]', 'TestPassword123!');
    await page.click('button:has-text("Create account")');
    await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });
    
    // Track for cleanup
    testUsers.push({ email: testEmail });
    
    // Sign out
    await page.click('button:has-text("Sign out"), [data-testid*="signout"]');
    await page.waitForLoadState('networkidle');
    
    // Sign back in
    await page.click('text=Already have an account? Sign in');
    await page.fill('input[placeholder*="email" i]', testEmail);
    await page.fill('input[placeholder*="password" i]', 'TestPassword123!');
    await page.click('button:has-text("Sign in")');
    
    // Verify successful signin
    await expect(page.locator('text=/Welcome|Dashboard/')).toBeVisible({ timeout: 10000 });
    
    // Verify session persists across page reload
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be signed in
    const isSignedIn = await page.locator('button:has-text("Sign out"), [data-testid*="signout"]').isVisible();
    expect(isSignedIn).toBeTruthy();
  });

  test('should handle signout and clear IndexedDB', async ({ page }) => {
    const testEmail = generateTestEmail('e2e-auth-signout');
    
    // Sign up first
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder*="email" i]', testEmail);
    await page.fill('input[placeholder*="first name" i]', 'Test');
    await page.fill('input[placeholder*="last name" i]', 'User');
    await page.fill('input[placeholder*="password" i]', 'TestPassword123!');
    await page.fill('input[placeholder*="confirm" i]', 'TestPassword123!');
    await page.click('button:has-text("Create account")');
    await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });
    
    // Track for cleanup
    testUsers.push({ email: testEmail });
    
    // Sign out
    await page.click('button:has-text("Sign out"), [data-testid*="signout"]');
    await page.waitForLoadState('networkidle');
    
    // Verify IndexedDB is cleared
    const tokenInStorage = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('blawby-storage', 1);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          const getRequest = store.get('auth-token');
          getRequest.onsuccess = () => resolve(getRequest.result);
          getRequest.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      });
    });
    
    expect(tokenInStorage).toBeNull();
  });
});
