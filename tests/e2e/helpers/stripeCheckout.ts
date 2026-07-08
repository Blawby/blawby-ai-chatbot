import { expect, type Frame, type Page } from '@playwright/test';

const STRIPE_CHECKOUT_HOST = /checkout\.stripe\.com/;
const STRIPE_HOSTED_INVOICE_HOST = /(checkout|invoice)\.stripe\.com/;

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

async function fillFieldInPageOrFrame(page: Page, selectors: string[], value: string, label: string): Promise<void> {
  const roots: Array<Page | Frame> = [page, ...page.frames()];
  for (const selector of selectors) {
    for (const root of roots) {
      const locator = root.locator(selector).first();
      try {
        await locator.waitFor({ state: 'visible', timeout: 2000 });
        await locator.fill(value);
        return;
      } catch {
        continue;
      }
    }
  }
  throw new Error(`Stripe hosted invoice: could not locate ${label} field. Tried: ${selectors.join(', ')}`);
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

export async function completeStripeHostedInvoicePaymentWithTestCard(page: Page): Promise<void> {
  await page.waitForURL(STRIPE_HOSTED_INVOICE_HOST, { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');

  const payInvoiceButton = page.getByRole('button', { name: /pay(?:\s+invoice)?/i }).first();
  if (await payInvoiceButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await payInvoiceButton.click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  }

  const emailLocator = page.locator('input[type="email"], input#email').first();
  try {
    await emailLocator.waitFor({ state: 'visible', timeout: 3000 });
    const current = await emailLocator.inputValue();
    if (!current) {
      await emailLocator.fill(`e2e-invoice-${Date.now()}@test-blawby.com`);
    }
  } catch {
    // Stripe may already know the invoice recipient.
  }

  await fillFieldInPageOrFrame(
    page,
    [
      'input[name="cardNumber"]',
      'input#cardNumber',
      'input[autocomplete="cc-number"]',
      'input[aria-label*="Card number" i]',
      'input[placeholder*="1234"]'
    ],
    TEST_CARD.number,
    'card number'
  );

  await fillFieldInPageOrFrame(
    page,
    [
      'input[name="cardExpiry"]',
      'input#cardExpiry',
      'input[autocomplete="cc-exp"]',
      'input[aria-label*="expiration" i]',
      'input[placeholder*="MM"]'
    ],
    TEST_CARD.exp,
    'card expiry'
  );

  await fillFieldInPageOrFrame(
    page,
    [
      'input[name="cardCvc"]',
      'input#cardCvc',
      'input[autocomplete="cc-csc"]',
      'input[aria-label*="CVC" i]',
      'input[placeholder*="CVC"]'
    ],
    TEST_CARD.cvc,
    'card CVC'
  );

  if (await page.locator('input[name="billingName"], input#billingName, input[autocomplete="cc-name"]').first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await fillFieldInPageOrFrame(
      page,
      ['input[name="billingName"]', 'input#billingName', 'input[autocomplete="cc-name"]'],
      TEST_CARD.name,
      'name on card'
    );
  }

  try {
    await fillFieldInPageOrFrame(
      page,
      [
        'input[name="billingPostalCode"]',
        'input#billingPostalCode',
        'input[autocomplete="postal-code"]',
        'input[aria-label*="ZIP" i]',
        'input[placeholder*="ZIP"]'
      ],
      TEST_CARD.postal,
      'postal code'
    );
  } catch {
    // Postal code is not always required.
  }

  const submitByRole = page.getByRole('button', { name: /pay|submit|complete/i }).first();
  const submitByType = page.locator('button[type="submit"]').first();
  if (await submitByRole.isVisible({ timeout: 5000 }).catch(() => false)) {
    await submitByRole.click();
  } else {
    await submitByType.click();
  }

  await expect(page.getByText(/paid|payment successful|thank you|receipt/i).first()).toBeVisible({ timeout: 60000 });
}
