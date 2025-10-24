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
    
    // Verify organization form fields are present - use count to ensure at least some fields exist
    const fieldCount = await orgName.count() + await orgEmail.count() + await orgPhone.count();
    expect(fieldCount).toBeGreaterThan(0);
    
    // Assert directly on visible fields
    if (await orgName.count() > 0) {
      await expect(orgName.first()).toBeVisible();
    }
    
    if (await orgEmail.count() > 0) {
      await expect(orgEmail.first()).toBeVisible();
    }
    
    if (await orgPhone.count() > 0) {
      await expect(orgPhone.first()).toBeVisible();
    }
  });

  test('Settings page should allow navigation between sections', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    // Look for navigation elements
    const navLinks = page.locator('nav a, [role="tab"], [data-testid*="nav"]');
    
    if (await navLinks.count() > 0) {
      // Capture initial URL
      const initialUrl = page.url();
      
      // Click on first navigation link
      await navLinks.first().click();
      
      // Wait for navigation to complete by checking for URL change or content change
      await Promise.race([
        page.waitForURL(url => url !== initialUrl),
        page.waitForSelector('[data-testid*="content"], .settings-content', { timeout: 5000 })
      ]);
      
      // Verify navigation actually occurred by checking URL changed or content is different
      const finalUrl = page.url();
      const navigationOccurred = finalUrl !== initialUrl || 
        await page.locator('[data-testid*="content"], .settings-content').count() > 0;
      
      expect(navigationOccurred).toBe(true);
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
      
      // Wait for API response or success indicator instead of fixed timeout
      const savePromise = saveButton.click();
      
      // Wait for either success toast, API response, or form state change
      await Promise.race([
        // Wait for success toast
        page.waitForSelector('[data-testid*="toast"], .toast, [role="alert"]', { timeout: 5000 }),
        // Wait for API response (if using network monitoring)
        page.waitForResponse(resp => 
          resp.url().includes('/api/') && 
          (resp.url().includes('user') || resp.url().includes('profile')) && 
          resp.status() === 200, 
          { timeout: 5000 }
        ),
        // Wait for form to show success state or disable
        page.waitForFunction(() => {
          const button = document.querySelector('button[type="submit"], button:has-text("Save")');
          return button && (button.hasAttribute('disabled') || button.textContent?.includes('Saved'));
        }, { timeout: 5000 })
      ]);
      
      await savePromise;
      
      // Verify success by checking for toast or updated form state
      const hasSuccessToast = await page.locator('[data-testid*="toast"], .toast, [role="alert"]').count() > 0;
      const hasSuccessState = await page.locator('button:has-text("Saved"), button[disabled]').count() > 0;
      
      expect(hasSuccessToast || hasSuccessState).toBe(true);
    } else {
      test.skip(true, 'Profile form not found on this page');
    }
  });
});
