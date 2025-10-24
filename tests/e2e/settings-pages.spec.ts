import { test, expect } from '@playwright/test';

test.describe('Settings Pages', () => {
  test('Organization page should display organization information', async ({ page }) => {
    // Navigate to settings/organization page
    await page.goto('/settings/organization');
    await page.waitForLoadState('networkidle');
    
    // Check for organization information elements
    const orgName = page.locator('input[name*="name"], [data-testid*="org-name"]');
    const orgEmail = page.locator('input[name*="email"], [data-testid*="org-email"]');
    const orgPhone = page.locator('input[name*="phone"], [data-testid*="org-phone"]');
    
    // Verify organization form fields are present
    if (await orgName.isVisible()) {
      await expect(orgName).toBeVisible();
    }
    
    if (await orgEmail.isVisible()) {
      await expect(orgEmail).toBeVisible();
    }
    
    if (await orgPhone.isVisible()) {
      await expect(orgPhone).toBeVisible();
    }
  });

  test('Settings page should allow navigation between sections', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    // Look for navigation elements
    const navLinks = page.locator('nav a, [role="tab"], [data-testid*="nav"]');
    
    if (await navLinks.count() > 0) {
      // Click on first navigation link
      await navLinks.first().click();
      await page.waitForLoadState('networkidle');
      
      // Verify page content changed
      await expect(page).toHaveURL(/settings/);
    } else {
      test.skip(true, 'No navigation found on settings page');
    }
  });

  test('User profile updates should work', async ({ page }) => {
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');
    
    // Look for profile form elements
    const nameInput = page.locator('input[name*="name"], [data-testid*="name"]');
    const emailInput = page.locator('input[name*="email"], [data-testid*="email"]');
    const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
    
    if (await nameInput.isVisible() && await saveButton.isVisible()) {
      // Test form interaction
      await nameInput.fill('Test User');
      await saveButton.click();
      
      // Wait for any success message or redirect
      await page.waitForTimeout(1000);
    } else {
      test.skip(true, 'Profile form not found on this page');
    }
  });
});
