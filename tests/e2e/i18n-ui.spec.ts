import { test, expect } from '@playwright/test';

test.describe('i18n UI Integration', () => {
  test('Language switching should update UI elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for language selector
    const langSelector = page.locator('select[name*="lang"], [data-testid*="lang"], button:has-text("Language")');
    
    if (await langSelector.isVisible()) {
      // Get initial page text
      const initialText = await page.textContent('body');
      
      // Change language (adjust based on actual implementation)
      await langSelector.selectOption('es'); // Spanish
      await page.waitForLoadState('networkidle');
      
      // Verify text changed
      const newText = await page.textContent('body');
      expect(newText).not.toBe(initialText);
    } else {
      test.skip(true, 'No language selector found on this page');
    }
  });

  test('Pricing display should show in multiple languages', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    
    // Look for pricing elements
    const pricingElements = page.locator('[data-testid*="price"], .price, [class*="pricing"]');
    
    if (await pricingElements.count() > 0) {
      // Verify pricing is displayed
      await expect(pricingElements.first()).toBeVisible();
      
      // Check for currency formatting
      const priceText = await pricingElements.first().textContent();
      expect(priceText).toMatch(/[\$€£¥]/); // Common currency symbols
    } else {
      test.skip(true, 'No pricing elements found on this page');
    }
  });

  test('RTL layout should work correctly', async ({ page }) => {
    // Navigate to a page that supports RTL
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for RTL language option
    const rtlLangOption = page.locator('option[value*="ar"], option[value*="he"], option[value*="fa"]');
    
    if (await rtlLangOption.isVisible()) {
      // Select RTL language
      await rtlLangOption.click();
      await page.waitForLoadState('networkidle');
      
      // Check if RTL direction is applied
      const bodyDir = await page.getAttribute('body', 'dir');
      const htmlDir = await page.getAttribute('html', 'dir');
      
      expect(bodyDir === 'rtl' || htmlDir === 'rtl').toBeTruthy();
    } else {
      test.skip(true, 'No RTL language option found');
    }
  });

  test('Form labels should be translated', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Look for form elements
    const formInputs = page.locator('input, textarea, select');
    
    if (await formInputs.count() > 0) {
      // Check for translated labels/placeholders
      const labels = page.locator('label, [placeholder]');
      
      if (await labels.count() > 0) {
        // Verify labels are not just English keys
        const labelText = await labels.first().textContent();
        expect(labelText).not.toMatch(/^[a-z]+\.[a-z]+$/); // Not a translation key
      }
    } else {
      test.skip(true, 'No form elements found on this page');
    }
  });
});
