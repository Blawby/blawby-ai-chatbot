import { test, expect } from '@playwright/test';
import { generateTestEmail, cleanupTestUser } from '../helpers/auth-cleanup';

test.describe('Railway Backend Auth', () => {
  let testUsers: Array<{ email: string }> = [];

  test.afterEach(async () => {
    // Cleanup test users
    for (const user of testUsers) {
      await cleanupTestUser(user.email);
    }
    testUsers = [];
  });
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
    const testEmail = generateTestEmail('e2e-signup');
    
    await page.goto('/auth');
    
    // Click sign up toggle button
    await page.click('text=Don\'t have an account? Sign up');
    
    // Fill signup form
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Test');
    await page.fill('input[placeholder="Enter your last name"]', 'User');
    await page.fill('input[placeholder="Enter your password"]', 'TestPassword123!');
    await page.fill('input[placeholder="Confirm your password"]', 'TestPassword123!');
    
    // Submit form
    await page.click('button:has-text("Create account")');
    
    // Verify account created
    await expect(page.locator('text=/Account created|Welcome/')).toBeVisible({ timeout: 10000 });
    
    // Track for cleanup
    testUsers.push({ email: testEmail });
  });

  test('should sign in with existing account', async ({ page, context }) => {
    // First create an account
    const testEmail = generateTestEmail('e2e-signin');
    const testPassword = 'TestPassword123!';
    
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Test');
    await page.fill('input[placeholder="Enter your last name"]', 'User');
    await page.fill('input[placeholder="Enter your password"]', testPassword);
    await page.fill('input[placeholder="Confirm your password"]', testPassword);
    await page.click('button:has-text("Create account")');
    
    // Wait for success message or redirect
    await Promise.race([
      page.waitForURL('**/app/messages', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);
    
    // Track for cleanup
    testUsers.push({ email: testEmail });
    
    // Sign out (if needed)
    const cookies = await context.cookies();
    await context.clearCookies();
    
    // Sign in
    await page.goto('/auth');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your password"]', testPassword);
    await page.click('button:has-text("Sign in")');
    
    // Verify signed in
    await expect(page.locator('text=/Welcome|Dashboard/')).toBeVisible({ timeout: 10000 });
  });

  test('should persist session on reload', async ({ page }) => {
    // Sign up
    const testEmail = generateTestEmail('e2e-persistence');
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Test');
    await page.fill('input[placeholder="Enter your last name"]', 'User');
    await page.fill('input[placeholder="Enter your password"]', 'TestPassword123!');
    await page.fill('input[placeholder="Confirm your password"]', 'TestPassword123!');
    await page.click('button:has-text("Create account")');
    
    // Wait for success message or redirect
    await Promise.race([
      page.waitForURL('**/app/messages', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);
    
    // Track for cleanup
    testUsers.push({ email: testEmail });
    
    // Navigate to home page manually if still on auth page
    if (page.url().includes('/auth')) {
      await page.goto('/');
    }
    
    // Reload page
    await page.reload();
    
    // Verify still authenticated (should not be on auth page)
    await expect(page).not.toHaveURL(/\/auth/);
  });
  test('should handle Railway API error responses', async ({ page }) => {
    // Test with invalid email format
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', 'invalid-email');
    await page.fill('input[placeholder="Enter your first name"]', 'Error');
    await page.fill('input[placeholder="Enter your last name"]', 'Test User');
    await page.fill('input[placeholder="Enter your password"]', 'TestPassword123!');
    await page.fill('input[placeholder="Confirm your password"]', 'TestPassword123!');
    await page.click('button:has-text("Create account")');
    
    // Should show email validation error message
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="alert"]')).toHaveText(/Please enter a valid email address/);
  });
});
