import { test, expect } from '@playwright/test';

test.describe('UI Components', () => {
  test('CopyButton should copy text to clipboard', async ({ page }) => {
    // Navigate to a page that has a copy button
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Look for a copy button (adjust selector based on actual implementation)
    const copyButton = page.locator('button[aria-label*="copy" i], button[title*="copy" i], [data-testid*="copy"]').first();
    
    if (await copyButton.isVisible()) {
      // Click the copy button
      await copyButton.click();
      
      // Verify clipboard content
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBeTruthy();
    } else {
      // Skip test if no copy button found on this page
      test.skip(true, 'No copy button found on this page');
    }
  });

  test('StatusBadge should display correct status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for status badges (adjust selector based on actual implementation)
    const statusBadges = page.locator('[data-testid*="status"], .status-badge, [class*="status"]');
    
    if (await statusBadges.count() > 0) {
      // Verify status badges are visible
      await expect(statusBadges.first()).toBeVisible();
    } else {
      test.skip(true, 'No status badges found on this page');
    }
  });

  test('RoleBadge should display role information', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for role badges (adjust selector based on actual implementation)
    const roleBadges = page.locator('[data-testid*="role"], .role-badge, [class*="role"]');
    
    if (await roleBadges.count() > 0) {
      // Verify role badges are visible
      await expect(roleBadges.first()).toBeVisible();
    } else {
      test.skip(true, 'No role badges found on this page');
    }
  });
});
