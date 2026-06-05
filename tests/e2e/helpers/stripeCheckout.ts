import { Page, expect } from '@playwright/test';

const STRIPE_CHECKOUT_HOST = /checkout\.stripe\.com/;

const TEST_CARD = {
  number: '4242 4242 4242 4242',
  exp: '12 / 34',
  cvc: '123',
  postal: '94103',
  name: 'E2E Test User'
};

async function fillField(page: Page, selectors: string[], value: string, label: string): Promise<void> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 4000 });
      await locator.fill(value);
      return;
    } catch {
      continue;
    }
  }
  throw new Error(`Stripe Checkout: could not locate ${label} field. Tried: ${selectors.join(', ')}`);
}

/**
 * Drives the Stripe-hosted Checkout page with a test card and waits for the
 * success redirect back to the app origin.
 *
 * Assumes:
 *   - Stripe Checkout is in `test` mode (staging backend uses test keys).
 *   - The session was started via Better Auth `subscription.upgrade`, which
 *     prefills customer email so we don't have to.
 *
 * If Stripe changes their hosted DOM, the field selectors below are the
 * first place to look. The `name="cardNumber"` etc. attributes have been
 * stable on the unified Checkout surface for ~2 years as of writing.
 */
export async function completeStripeCheckoutWithTestCard(page: Page, appOrigin: string): Promise<void> {
  await page.waitForURL(STRIPE_CHECKOUT_HOST, { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');

  // Some Stripe Checkout layouts ask for email even when prefilled; only fill
  // if visible and empty.
  const emailLocator = page.locator('input[type="email"], input#email').first();
  try {
    await emailLocator.waitFor({ state: 'visible', timeout: 3000 });
    const current = await emailLocator.inputValue();
    if (!current) {
      await emailLocator.fill(`e2e-stripe-${Date.now()}@test-blawby.com`);
    }
  } catch {
    // Email field not shown — already attached to the customer.
  }

  await fillField(
    page,
    ['input[name="cardNumber"]', 'input#cardNumber', 'input[autocomplete="cc-number"]'],
    TEST_CARD.number,
    'card number'
  );

  await fillField(
    page,
    ['input[name="cardExpiry"]', 'input#cardExpiry', 'input[autocomplete="cc-exp"]'],
    TEST_CARD.exp,
    'card expiry'
  );

  await fillField(
    page,
    ['input[name="cardCvc"]', 'input#cardCvc', 'input[autocomplete="cc-csc"]'],
    TEST_CARD.cvc,
    'card CVC'
  );

  await fillField(
    page,
    ['input[name="billingName"]', 'input#billingName', 'input[autocomplete="cc-name"]'],
    TEST_CARD.name,
    'name on card'
  );

  // Postal code is only required in some country contexts. Best-effort.
  try {
    await fillField(
      page,
      ['input[name="billingPostalCode"]', 'input#billingPostalCode', 'input[autocomplete="postal-code"]'],
      TEST_CARD.postal,
      'postal code'
    );
  } catch {
    // No postal field rendered — fine.
  }

  // Submit. Stripe Checkout's submit button is consistently the page's
  // primary action — match by role + accessible name fallback to type=submit.
  const submitByRole = page.getByRole('button', { name: /subscribe|pay|start trial/i }).first();
  const submitByType = page.locator('button[type="submit"]').first();
  if (await submitByRole.isVisible().catch(() => false)) {
    await submitByRole.click();
  } else {
    await submitByType.click();
  }

  // Stripe redirects back to the configured successUrl on the app origin.
  await page.waitForURL((url) => url.toString().startsWith(appOrigin), { timeout: 60000 });
  await expect(page).toHaveURL(/[?&]subscription=success/);
}
