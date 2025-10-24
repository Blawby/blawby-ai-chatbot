import { test, expect } from '@playwright/test';

test.describe('RTL Language Switching', () => {
  test('should switch to RTL mode for Arabic and apply CSS correctly', async ({ page }) => {
    await page.goto('/');
    
    // Verify starts in LTR mode (English)
    let dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');
    
    // Switch to Arabic (need to find your language selector)
    // Adjust selectors based on your actual UI:
    await page.click('[data-testid="language-selector"]');
    await page.click('[data-testid="locale-ar"]'); // or text=العربية
    
    // Verify dir attribute changed
    dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
    
    // Verify lang attribute
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('ar');
  });

  test('should apply RTL CSS styles correctly', async ({ page }) => {
    await page.goto('/');
    
    // Create test element with ml-auto class
    await page.evaluate(() => {
      const div = document.createElement('div');
      div.className = 'ml-auto';
      div.id = 'test-ml-auto';
      div.style.width = '100px';
      document.body.appendChild(div);
    });
    
    // Switch to RTL
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl');
    });
    
    // Verify CSS is actually applied (this works in real browser!)
    const marginRight = await page.locator('#test-ml-auto').evaluate(el => 
      window.getComputedStyle(el).marginRight
    );
    expect(marginRight).toBe('auto');
    
    const marginLeft = await page.locator('#test-ml-auto').evaluate(el => 
      window.getComputedStyle(el).marginLeft
    );
    expect(marginLeft).toBe('0px');
  });

  test('should flip chat markdown lists in RTL', async ({ page }) => {
    await page.goto('/');
    
    // Create chat markdown element
    await page.evaluate(() => {
      const div = document.createElement('div');
      div.className = 'chat-markdown';
      div.innerHTML = '<ul><li>Test item</li></ul>';
      div.id = 'test-markdown';
      document.body.appendChild(div);
    });
    
    // Set RTL
    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl');
    });
    
    // Verify list margins are flipped
    const marginRight = await page.locator('#test-markdown ul').evaluate(el =>
      window.getComputedStyle(el).marginRight
    );
    expect(marginRight).toBe('1.25rem'); // 20px
    
    const marginLeft = await page.locator('#test-markdown ul').evaluate(el =>
      window.getComputedStyle(el).marginLeft
    );
    expect(marginLeft).toBe('0px');
  });

  test('should persist RTL preference across page reloads', async ({ page }) => {
    await page.goto('/');
    
    // Switch to Arabic
    await page.click('[data-testid="language-selector"]');
    await page.click('[data-testid="locale-ar"]');
    
    // Reload page
    await page.reload();
    
    // Verify RTL persisted
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
    
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('ar');
  });
});
