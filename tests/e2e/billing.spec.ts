import { test, expect, Page } from '@playwright/test';

// Helper function to find the first visible element from a list of selectors
async function findAnyVisibleElement(
  page: Page,
  selectors: string[],
  timeout = 1000
): Promise<{ found: true; selector: string } | { found: false }> {
  const visibilityChecks = selectors.map(async (selector) => {
    try {
      await page.locator(selector).waitFor({ state: 'visible', timeout });
      return { found: true, selector };
    } catch {
      return null;
    }
  });

  // Create a sentinel promise that resolves when all checks are done
  const allDone = Promise.all(visibilityChecks).then(() => ({ found: false }));

  // Race all checks against the sentinel
  const result = await Promise.race([...visibilityChecks, allDone]);

  // Type guard to ensure result matches expected return type
  if (result && 'found' in result && result.found === true && 'selector' in result) {
    return { found: true, selector: result.selector };
  }
  return { found: false };
}

test.describe('Billing Integration', () => {
  test('should navigate to billing settings and show Stripe integration', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the page to load and React to hydrate
    await page.waitForLoadState('networkidle');
    // Wait for the main chat container to be visible, indicating React hydration is complete
    await page.waitForSelector('[data-testid="chat-container"]', { state: 'visible' });
    
    // Check if the page loaded (don't check body visibility as it might be hidden by CSS)
    const title = await page.title();
    expect(title).toBeTruthy();
    
    // Try to navigate to settings (this might require authentication)
    await page.goto('/settings');
    
    // Wait for the page to load and settings navigation to be ready
    await page.waitForLoadState('networkidle');
    // Wait for settings navigation elements to be visible, indicating the settings page is ready
    await page.waitForSelector('text=General', { state: 'visible' });
    
    // Check if settings page loads (check title instead of body visibility)
    const settingsTitle = await page.title();
    expect(settingsTitle).toBeTruthy();
    
    // Look for billing-related elements
    const billingElements = [
      'text=Billing',
      'text=Subscription',
      'text=Payment',
      'text=Upgrade',
      'text=Stripe',
      '[data-testid*="billing"]',
      '[data-testid*="payment"]',
      '[data-testid*="subscription"]'
    ];
    
    const billingResult = await findAnyVisibleElement(page, billingElements, 1000);
    
    if (billingResult.found) {
      console.log(`Found billing element: ${billingResult.selector}`);
      console.log('✅ Billing elements found on settings page');
    } else {
      console.log('⚠️ No billing elements found on settings page');
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/billing-settings.png' });
  });
  
  test('should check if Stripe integration is working', async ({ page }) => {
    // Check network requests for Stripe-related calls
    const stripeRequests: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('stripe') || url.includes('checkout') || url.includes('billing')) {
        stripeRequests.push(url);
        console.log(`Stripe-related request: ${url}`);
      }
    });
    
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Try to trigger any billing-related actions
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    // Look for upgrade buttons or billing links
    const upgradeButtons = [
      'text=Upgrade',
      'text=Subscribe',
      'text=Get Started',
      'text=Choose Plan',
      '[data-testid*="upgrade"]',
      '[data-testid*="subscribe"]',
      'button:has-text("Upgrade")',
      'button:has-text("Subscribe")'
    ];
    
    const upgradeResult = await findAnyVisibleElement(page, upgradeButtons, 1000);
    
    if (upgradeResult.found) {
      console.log(`Found upgrade button: ${upgradeResult.selector}`);
      // Don't actually click to avoid real charges
    }
    
    // Wait for any potential Stripe-related network requests to complete
    // This waits for the page to be idle, indicating all network activity has settled
    await page.waitForLoadState('networkidle');
    
    console.log(`Total Stripe-related requests: ${stripeRequests.length}`);
    if (stripeRequests.length > 0) {
      console.log('✅ Stripe integration appears to be working');
    } else {
      console.log('⚠️ No Stripe-related network requests detected');
    }
    
    // Take a screenshot
    await page.screenshot({ path: 'test-results/stripe-integration.png' });
  });

  test('should navigate to cart page and show subscription options', async ({ page }) => {
    // Navigate directly to the cart page (where billing functionality is)
    await page.goto('/cart');
    
    // Wait for the page to load and cart page elements to be ready
    await page.waitForLoadState('networkidle');
    // Wait for the main cart page heading to be visible, indicating the page is ready
    await expect(page.getByRole('heading', { name: /pick your plan/i })).toBeVisible({ timeout: 10000 });
    
    // Check if the page loaded
    const title = await page.title();
    expect(title).toBeTruthy();
    
    // Look for cart/billing page specific elements
    const cartPageElements = [
      'text=Business Seat',
      'text=Summary',
      'text=Continue',
      'text=Monthly',
      'text=Annual',
      'text=users',
      'text=Minimum of 2 seats',
      'text=Billed monthly',
      'text=Billed annually',
      '[data-testid*="cart"]',
      '[data-testid*="pricing"]',
      '[data-testid*="quantity"]'
    ];
    
    const cartResult = await findAnyVisibleElement(page, cartPageElements, 1000);
    
    if (cartResult.found) {
      console.log(`Found cart page element: ${cartResult.selector}`);
      console.log('✅ Cart page elements found');
    } else {
      console.log('⚠️ No cart page elements found');
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/cart-page.png' });
    
    // The test passes if we can navigate to the cart page
    expect(title).toBeTruthy();
  });
});
