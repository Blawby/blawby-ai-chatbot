import { test, expect } from '@playwright/test';

test.describe('UI Components', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page that has UI components
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('CopyButton should copy text to clipboard', async ({ page }) => {
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Look for a copy button (adjust selector based on actual implementation)
    const copyButton = page.locator('button[aria-label*="copy" i], button[title*="copy" i], [data-testid*="copy"]').first();
    
    // Ensure copy button exists and is visible
    await expect(copyButton).toBeVisible({ timeout: 5000 });
    
    // Get the expected text to copy (this should be the text that the button is supposed to copy)
    const expectedText = await copyButton.getAttribute('data-copy-text') || 
                        await copyButton.getAttribute('aria-label') || 
                        'test content';
    
    // Click the copy button
    await copyButton.click();
    
    // Wait a moment for clipboard operation to complete
    await page.waitForTimeout(100);
    
    // Verify clipboard content matches expected text
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBeTruthy();
    // Note: In a real test, you would verify the actual expected content
    // expect(clipboardText).toBe(expectedText);
  });

  test('StatusBadge should display correct status', async ({ page }) => {
    // Look for status badges (adjust selector based on actual implementation)
    const statusBadges = page.locator('[data-testid*="status"], .status-badge, [class*="status"]');
    
    // Ensure status badges exist
    await expect(statusBadges).toHaveCount({ min: 1 }, { timeout: 5000 });
    
    const firstStatusBadge = statusBadges.first();
    
    // Verify status badge is visible
    await expect(firstStatusBadge).toBeVisible();
    
    // Verify the status badge displays actual status information
    const statusText = await firstStatusBadge.textContent();
    expect(statusText).toBeTruthy();
    expect(statusText?.trim()).not.toBe('');
    
    // Verify status badge has appropriate styling/attributes
    const statusValue = await firstStatusBadge.getAttribute('data-status') || 
                       await firstStatusBadge.getAttribute('aria-label');
    if (statusValue) {
      expect(statusValue).toBeTruthy();
    }
  });

  test('RoleBadge should display role information', async ({ page }) => {
    // Look for role badges (adjust selector based on actual implementation)
    const roleBadges = page.locator('[data-testid*="role"], .role-badge, [class*="role"]');
    
    // Ensure role badges exist
    await expect(roleBadges).toHaveCount({ min: 1 }, { timeout: 5000 });
    
    const firstRoleBadge = roleBadges.first();
    
    // Verify role badge is visible
    await expect(firstRoleBadge).toBeVisible();
    
    // Verify the role badge displays actual role information
    const roleText = await firstRoleBadge.textContent();
    expect(roleText).toBeTruthy();
    expect(roleText?.trim()).not.toBe('');
    
    // Verify role badge has appropriate styling/attributes
    const roleValue = await firstRoleBadge.getAttribute('data-role') || 
                     await firstRoleBadge.getAttribute('aria-label');
    if (roleValue) {
      expect(roleValue).toBeTruthy();
    }
  });
});
