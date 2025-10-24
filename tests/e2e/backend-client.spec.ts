import { test, expect } from '@playwright/test';
import { generateTestEmail, cleanupTestUser } from '../helpers/auth-cleanup';

// Helper function to get token from IndexedDB
async function getTokenFromStorage(page: any): Promise<string | null> {
  return await page.evaluate(async () => {
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
}

test.describe('BackendClient - Real API Integration Tests', () => {
  let testUsers: Array<{ email: string; token?: string }> = [];

  test.beforeEach(() => {
    // Clear any existing test users
    testUsers = [];
  });

  test.afterEach(async () => {
    // Clean up test users after each test
    if (testUsers.length > 0) {
      console.log(`🧹 Cleaning up ${testUsers.length} test users...`);
      for (const user of testUsers) {
        try {
          await cleanupTestUser(user.email, user.token);
        } catch (error) {
          console.warn(`Failed to cleanup user ${user.email}:`, error);
        }
      }
      testUsers = [];
    }
  });

  test.describe('signup()', () => {
    test('should create user account and save token/user data', async ({ page }) => {
      const testEmail = generateTestEmail('signup-test');
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      // Navigate to auth page and perform signup
      await page.goto('/auth');
      await page.click('text=Don\'t have an account? Sign up');
      await page.fill('input[placeholder*="email" i]', testEmail);
      await page.fill('input[placeholder*="first name" i]', testName);
      await page.fill('input[placeholder*="last name" i]', 'User');
      await page.fill('input[placeholder*="password" i]', testPassword);
      await page.fill('input[placeholder*="confirm" i]', testPassword);
      await page.click('button:has-text("Create account")');

      // Wait for success
      await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });

      // Verify token is stored in IndexedDB
      const tokenInStorage = await getTokenFromStorage(page);

      expect(tokenInStorage).toBeTruthy();
      
      // Track for cleanup
      testUsers.push({ email: testEmail, token: tokenInStorage as string });
    });

    test('should handle signup with duplicate email', async ({ page }) => {
      const testEmail = generateTestEmail('duplicate-test');
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      // First signup
      await page.goto('/auth');
      await page.click('text=Don\'t have an account? Sign up');
      await page.fill('input[placeholder*="email" i]', testEmail);
      await page.fill('input[placeholder*="first name" i]', testName);
      await page.fill('input[placeholder*="last name" i]', 'User');
      await page.fill('input[placeholder*="password" i]', testPassword);
      await page.fill('input[placeholder*="confirm" i]', testPassword);
      await page.click('button:has-text("Create account")');
      await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });

      // Get token for cleanup
      const tokenInStorage = await getTokenFromStorage(page);

      // Track for cleanup
      testUsers.push({ email: testEmail, token: tokenInStorage as string });

      // Try to signup again with same email
      await page.click('text=Don\'t have an account? Sign up');
      await page.fill('input[placeholder*="email" i]', testEmail);
      await page.fill('input[placeholder*="first name" i]', 'Another');
      await page.fill('input[placeholder*="last name" i]', 'User');
      await page.fill('input[placeholder*="password" i]', testPassword);
      await page.fill('input[placeholder*="confirm" i]', testPassword);
      await page.click('button:has-text("Create account")');

      // Should show error for duplicate email
      await expect(page.locator('text=/already exists|duplicate/i')).toBeVisible({ timeout: 5000 });
    });

    test('should handle invalid email format', async ({ page }) => {
      await page.goto('/auth');
      await page.click('text=Don\'t have an account? Sign up');
      await page.fill('input[placeholder*="email" i]', 'invalid-email');
      await page.fill('input[placeholder*="first name" i]', 'Test');
      await page.fill('input[placeholder*="last name" i]', 'User');
      await page.fill('input[placeholder*="password" i]', 'TestPassword123!');
      await page.fill('input[placeholder*="confirm" i]', 'TestPassword123!');
      await page.click('button:has-text("Create account")');

      // Should show validation error
      await expect(page.locator('text=/invalid.*email|email.*invalid/i')).toBeVisible({ timeout: 5000 });
    });

    test('should handle weak password', async ({ page }) => {
      await page.goto('/auth');
      await page.click('text=Don\'t have an account? Sign up');
      await page.fill('input[placeholder*="email" i]', generateTestEmail('weak-password'));
      await page.fill('input[placeholder*="first name" i]', 'Test');
      await page.fill('input[placeholder*="last name" i]', 'User');
      await page.fill('input[placeholder*="password" i]', '123');
      await page.fill('input[placeholder*="confirm" i]', '123');
      await page.click('button:has-text("Create account")');

      // Should show password strength error
      await expect(page.locator('text=/password.*weak|weak.*password/i')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('signin()', () => {
    test('should authenticate existing user and save token/user data', async ({ page }) => {
      const testEmail = generateTestEmail('signin-test');
      const testPassword = 'TestPassword123!';

      // First create account
      await page.goto('/auth');
      await page.click('text=Don\'t have an account? Sign up');
      await page.fill('input[placeholder*="email" i]', testEmail);
      await page.fill('input[placeholder*="first name" i]', 'Test');
      await page.fill('input[placeholder*="last name" i]', 'User');
      await page.fill('input[placeholder*="password" i]', testPassword);
      await page.fill('input[placeholder*="confirm" i]', testPassword);
      await page.click('button:has-text("Create account")');
      await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });

      // Get token for cleanup
      const tokenInStorage = await getTokenFromStorage(page);

      // Track for cleanup
      testUsers.push({ email: testEmail, token: tokenInStorage as string });

      // Sign out
      await page.click('button:has-text("Sign out")');
      await page.waitForLoadState('networkidle');

      // Sign back in
      await page.click('text=Already have an account? Sign in');
      await page.fill('input[placeholder*="email" i]', testEmail);
      await page.fill('input[placeholder*="password" i]', testPassword);
      await page.click('button:has-text("Sign in")');

      // Verify successful signin
      await expect(page.locator('text=/Welcome|Dashboard/')).toBeVisible({ timeout: 10000 });

      // Verify token is stored in IndexedDB
      const tokenInStorage = await getTokenFromStorage(page);

      expect(tokenInStorage).toBeTruthy();
    });

    test('should handle invalid credentials', async ({ page }) => {
      await page.goto('/auth');
      await page.click('text=Already have an account? Sign in');
      await page.fill('input[placeholder*="email" i]', generateTestEmail('invalid-creds'));
      await page.fill('input[placeholder*="password" i]', 'WrongPassword123!');
      await page.click('button:has-text("Sign in")');

      // Should show authentication error
      await expect(page.locator('text=/invalid.*credentials|authentication.*failed/i')).toBeVisible({ timeout: 5000 });
    });

    test('should handle non-existent user', async ({ page }) => {
      await page.goto('/auth');
      await page.click('text=Already have an account? Sign in');
      await page.fill('input[placeholder*="email" i]', generateTestEmail('non-existent'));
      await page.fill('input[placeholder*="password" i]', 'TestPassword123!');
      await page.click('button:has-text("Sign in")');

      // Should show user not found error
      await expect(page.locator('text=/user.*not.*found|account.*not.*found/i')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('signout()', () => {
    test('should sign out user and clear storage', async ({ page }) => {
      const testEmail = generateTestEmail('signout-test');
      const testPassword = 'TestPassword123!';

      // Create account and sign in
      await page.goto('/auth');
      await page.click('text=Don\'t have an account? Sign up');
      await page.fill('input[placeholder*="email" i]', testEmail);
      await page.fill('input[placeholder*="first name" i]', 'Test');
      await page.fill('input[placeholder*="last name" i]', 'User');
      await page.fill('input[placeholder*="password" i]', testPassword);
      await page.fill('input[placeholder*="confirm" i]', testPassword);
      await page.click('button:has-text("Create account")');
      await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });

      // Get token for cleanup
      const tokenInStorage = await getTokenFromStorage(page);

      // Track for cleanup
      testUsers.push({ email: testEmail, token: tokenInStorage as string });

      // Sign out
      await page.click('button:has-text("Sign out")');
      await page.waitForLoadState('networkidle');

      // Verify IndexedDB is cleared
      const tokenAfterSignout = await getTokenFromStorage(page);

      expect(tokenAfterSignout).toBeNull();
    });
  });
});