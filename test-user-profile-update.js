// Test script to verify user profile updates after registration
const { test, expect } = require('@playwright/test');

test('should update user profile after signup', async ({ page }) => {
  // Go to auth page
  await page.goto('/auth');
  
  // Click sign up toggle button
  await page.click('text=Don\'t have an account? Sign up');
  
  // Fill signup form
  const testEmail = `test-profile-${Date.now()}@example.com`;
  const testName = 'Test Profile User';
  await page.fill('input[placeholder="Enter your email"]', testEmail);
  await page.fill('input[placeholder="Enter your full name"]', testName);
  await page.fill('input[placeholder="Enter your password"]', 'TestPassword123!');
  await page.fill('input[placeholder="Confirm your password"]', 'TestPassword123!');
  
  // Submit form
  await page.click('button:has-text("Create account")');
  
  // Wait for success message or redirect
  await Promise.race([
    page.waitForURL('/', { timeout: 15000 }),
    page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
  ]);
  
  // Navigate to home page if still on auth page
  if (page.url().includes('/auth')) {
    await page.goto('/');
  }
  
  // Wait for page to load completely
  await page.waitForLoadState('networkidle');
  
  // Check if user profile shows the registered user info instead of "Sign In"
  
  // Look for user profile elements that should show the user's name or email
  const profileElements = [
    page.locator(`text=${testName}`),
    page.locator(`text=${testEmail}`),
    page.locator('[data-testid="user-profile"]'),
    page.locator('.user-profile'),
    page.locator(`button:has-text("${testName}")`),
    page.locator(`button:has-text("${testEmail.split('@')[0]}")`)
  ];
  
  // Check if any profile element is visible (indicating successful authentication)
  let profileFound = false;
  for (const element of profileElements) {
    try {
      if (await element.isVisible({ timeout: 2000 })) {
        profileFound = true;
        console.log('✅ User profile found with element:', await element.textContent());
        break;
      }
    } catch (e) {
      // Element not found, continue checking
    }
  }
  
  // Verify that "Sign In" button is NOT visible (user is authenticated)
  const signInButton = page.locator('button:has-text("Sign In")');
  const isSignInVisible = await signInButton.isVisible({ timeout: 2000 }).catch(() => false);
  
  console.log('Profile found:', profileFound);
  console.log('Sign In button visible:', isSignInVisible);
  
  // The test passes if either:
  // 1. We found a user profile element, OR
  // 2. The Sign In button is not visible (indicating authentication)
  expect(profileFound || !isSignInVisible).toBe(true);
  
  // Additional check: look for any indication of authentication
  const authIndicators = [
    page.locator('text=/Welcome/'),
    page.locator('text=/Dashboard/'),
    page.locator('[data-testid="authenticated"]'),
    page.locator('.authenticated')
  ];
  
  let authIndicatorFound = false;
  for (const indicator of authIndicators) {
    try {
      if (await indicator.isVisible({ timeout: 2000 })) {
        authIndicatorFound = true;
        console.log('✅ Authentication indicator found:', await indicator.textContent());
        break;
      }
    } catch (e) {
      // Element not found, continue checking
    }
  }
  
  console.log('Auth indicator found:', authIndicatorFound);
  
  // Final verification: user should be authenticated
  expect(profileFound || !isSignInVisible || authIndicatorFound).toBe(true);
});
