/**
 * Full end-to-end registration → onboarding → dashboard for a new practice member.
 *
 * Covers:
 *   1. Email/password signup via the auth form
 *   2. Onboarding step 1 (About you)
 *   3. Onboarding step 2 (Practice profile) — creates the practice via POST /api/practice
 *   4. Onboarding step 3 — drives Stripe-hosted Checkout with test card 4242
 *   5. Onboarding steps 4–6 (Stripe Connect intro, intake form, share intake)
 *   6. Final landing assertion: workspace home at /practice/:slug
 *
 * Caveats:
 *   - Hits the staging backend (auth, Better Auth subscription.upgrade, /api/practice).
 *     Every passing run creates one new user, one practice/org, and one test-mode
 *     Stripe customer + subscription. No teardown is wired in (resetTestUsers.ts is
 *     a stub) — accumulating staging state is a known cost.
 *   - The Stripe Checkout interaction is the most fragile part. If Stripe changes
 *     their hosted DOM, see tests/e2e/helpers/stripeCheckout.ts.
 *   - Restricted to the chromium project. The four-viewport public config would
 *     otherwise spawn this 4× per run.
 */

import { expect, test } from './fixtures.public';
import { waitForSession } from './helpers/auth';
import { completeStripeCheckoutWithTestCard } from './helpers/stripeCheckout';

const ONBOARDING_TIMEOUT_MS = 240_000;

interface SubscriptionResponseRecord {
  status: number;
  url: string;
  body: string;
  beforePracticeCreated: boolean;
}

test.describe('New practice member registration → dashboard', () => {
  test.describe.configure({ mode: 'serial', timeout: ONBOARDING_TIMEOUT_MS });

  test('signs up, completes onboarding (with Stripe Checkout), and lands on workspace home', async ({
    unauthContext,
    baseURL
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Signup flow creates real backend state — run only on the chromium project.'
    );
    const page = await unauthContext.newPage();
    const appOrigin = new URL(baseURL ?? 'https://dev.blawby.com').origin;
    const subscriptionResponses: SubscriptionResponseRecord[] = [];
    const subscriptionConsoleErrors: string[] = [];
    let practiceCreated = false;

    // Capture diagnostics so when the test fails, we can see WHY the redirect
    // didn't happen — the failure DOM alone is too thin.
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = msg.text();
        if (text.includes('/api/subscriptions/current') || text.includes('[ONBOARDING][SUBSCRIPTION]')) {
          subscriptionConsoleErrors.push(text);
        }
        // eslint-disable-next-line no-console
        console.log(`[browser ${msg.type()}]`, text);
      }
    });
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.log('[browser pageerror]', err.message);
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        // eslint-disable-next-line no-console
        console.log('[nav]', frame.url());
      }
    });
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/subscriptions/current')) {
        const record: SubscriptionResponseRecord = {
          status: response.status(),
          url,
          body: '',
          beforePracticeCreated: !practiceCreated
        };
        subscriptionResponses.push(record);
        record.body = (await response.text().catch(() => '')).slice(0, 500);
      }
      if (url.includes('/api/auth/') && response.request().method() !== 'GET') {
        // eslint-disable-next-line no-console
        console.log(`[net] ${response.request().method()} ${response.status()} ${url}`);
      }
    });

    const timestamp = Date.now();
    const user = {
      name: 'E2E Practice Owner',
      email: `e2e-practice-${timestamp}@test-blawby.com`,
      password: 'TestPassword123!'
    };
    const practice = {
      name: `E2E Practice ${timestamp}`,
      jurisdiction: 'NC'
    };

    // 1. Sign up
    await page.goto('/auth');
    await page.getByTestId('auth-toggle-signup').click();
    await page.getByTestId('signup-name-input').fill(user.name);
    await page.getByTestId('signup-email-input').fill(user.email);
    await page.getByTestId('signup-password-input').fill(user.password);
    await page.getByTestId('signup-confirm-password-input').fill(user.password);
    await page.getByTestId('signup-submit-button').click();

    await waitForSession(page, { timeoutMs: 20000 });

    // AppShell forces the user to /onboarding because onboarding_complete is false.
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    await expect(page.getByTestId('onboarding-flow')).toBeVisible();
    await page.waitForTimeout(2000);

    expect(
      subscriptionResponses.filter((response) => response.beforePracticeCreated),
      'onboarding must not load /api/subscriptions/current before the user has an org'
    ).toEqual([]);
    expect(subscriptionConsoleErrors, 'subscription lookup should not produce browser console errors').toEqual([]);

    // 2. Step 1 — About you
    await page.locator('#onboarding-birthday').fill('1990-01-15');
    await page.locator('#onboarding-terms').check();
    await page.getByRole('button', { name: /Continue → Your practice/i }).click();

    // 3. Step 2 — Practice profile (creates the practice via POST /api/practice)
    await expect(page.getByText(/Step 2 of 6 · Your practice/i)).toBeVisible();
    await page.locator('#onboarding-firmName').fill(practice.name);
    await page.locator('#onboarding-jurisdiction').selectOption(practice.jurisdiction);
    await expect(page.locator('#onboarding-jurisdiction')).toContainText('WY · Wyoming');
    await expect(page.getByText('Civil litigation')).toHaveCount(0);

    const createPracticeRequest = page.waitForRequest(
      (request) => request.url().includes('/api/practice') && request.method() === 'POST',
      { timeout: 30000 }
    );
    const createPracticeResponse = page.waitForResponse(
      (response) => response.url().includes('/api/practice') && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: /Continue → Get Business/i }).click();
    const practiceRequest = await createPracticeRequest;
    const practicePayload = practiceRequest.postDataJSON() as {
      supported_states?: Array<{ country?: string; states?: string[] }>;
      metadata?: { jurisdictions?: string[] };
    };
    expect(practicePayload.supported_states).toEqual([
      { country: 'US', states: [practice.jurisdiction] },
    ]);
    expect(practicePayload.metadata?.jurisdictions).toEqual([practice.jurisdiction]);
    const practiceResponse = await createPracticeResponse;
    expect(practiceResponse.ok()).toBe(true);
    practiceCreated = true;
    const practiceBody = await practiceResponse.json();
    const createdPractice = practiceBody.practice ?? practiceBody;
    expect(createdPractice.id, 'practice creation response must include the Better Auth organization id').toEqual(expect.any(String));

    // 4. Step 3 — Get Business → Stripe Checkout
    await expect(page.getByText(/Step 3 of 6 · Get Business/i)).toBeVisible();
    await page.waitForTimeout(2000);
    expect(
      subscriptionResponses.filter((response) => response.beforePracticeCreated),
      'subscription lookups must remain deferred until after /api/practice creates the org'
    ).toEqual([]);
    expect(
      subscriptionResponses.filter((response) => response.status === 403),
      '/api/subscriptions/current must never fail with missing organization context during onboarding'
    ).toEqual([]);

    const upgradeRequestPromise = page.waitForRequest(
      (request) => request.url().includes('/api/auth/subscription/upgrade') && request.method() === 'POST',
      { timeout: 30000 }
    );
    const upgradeButton = page.getByRole('button', { name: /^(Upgrade|Subscribe|Get .*\$|Start)/i }).first();
    await upgradeButton.click();
    const upgradeRequest = await upgradeRequestPromise;
    const upgradePayload = upgradeRequest.postDataJSON() as { referenceId?: string; successUrl?: string };
    expect(upgradePayload.referenceId, 'checkout must target the org created by /api/practice').toBe(createdPractice.id);
    expect(upgradePayload.successUrl, 'checkout success URL should carry the practice id through Stripe').toContain(
      `practiceId=${encodeURIComponent(createdPractice.id as string)}`
    );

    await completeStripeCheckoutWithTestCard(page, appOrigin);

    // Stripe success redirects to "/" — AppShell pushes the user back to /onboarding.
    // The draft is preserved in localStorage; step state resets to 1.
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    await expect(page.getByTestId('onboarding-flow')).toBeVisible();

    // Click through step 1 and step 2 (fields/org preserved), then continue
    // past the now-subscribed Business step.
    await page.getByRole('button', { name: /Continue → Your practice/i }).click();
    await expect(page.getByText(/Step 2 of 6 · Your practice/i)).toBeVisible();
    await page.getByRole('button', { name: /Continue → Get Business/i }).click();
    await expect(page.getByText(/Step 3 of 6 · Get Business/i)).toBeVisible();
    await page.getByRole('button', { name: /Continue → Payments/i }).click();

    // 5. Steps 4 → 5 → 6
    await expect(page.getByText(/Step 4 of 6 · Payments/i)).toBeVisible();
    await page.getByRole('button', { name: /Continue → Your intake form/i }).click();

    await expect(page.getByText(/Step 5 of 6 · Your intake form/i)).toBeVisible();
    await page.getByRole('button', { name: /Continue → Share intake/i }).click();

    await expect(page.getByText(/Step 6 of 6 · Share intake/i)).toBeVisible();
    await page.getByRole('button', { name: /Open your workspace →/i }).click();

    // 6. Final assertion — workspace home.
    // Landing on /practice/:slug is the canonical proof: RootRoute only routes
    // there when the user has a fully-onboarded practice membership (session
    // has onboarding_complete=true AND an active org). No need for a separate
    // session-body check.
    await page.waitForURL(
      (url) => new URL(url).pathname.startsWith('/practice/'),
      { timeout: 30000 }
    );

    expect(subscriptionConsoleErrors, 'subscription lookup should not produce browser console errors').toEqual([]);
    expect(
      subscriptionResponses.filter((response) => response.status === 403),
      '/api/subscriptions/current must not regress to the no-org 403'
    ).toEqual([]);

    await page.close();
  });
});
