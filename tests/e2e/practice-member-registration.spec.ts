/**
 * Full end-to-end registration → onboarding for a new practice member.
 *
 * Covers:
 *   1. Email/password signup via the auth form
 *   2. Onboarding step 1 (About you)
 *   3. Onboarding step 2 (Practice profile) — creates the practice via POST /api/practice
 *   4. Onboarding step 3 — drives Stripe-hosted Checkout with test card 4242
 *   5. Onboarding step 4 — starts Stripe Connect and asserts the payload
 *   6. Onboarding steps 5–6 — intake form preview and public preview link
 *   7. Completion save via Better Auth update-user
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

  test('signs up and completes onboarding through payment, payouts, intake, and public preview', async ({
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
    await expect(page.getByRole('button', { name: /^Transactional$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Regulatory$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Litigation$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Contract drafting' })).toBeVisible();
    await page.getByLabel('Add custom practice area').fill('Aviation law');
    await page.locator('#onboarding-practice-area-other').press('Enter');
    await expect(page.getByText('Aviation law', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Aviation law' })).toBeVisible();

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
    await expect(page.getByRole('button', { name: /skip/i })).toHaveCount(0);
    await expect(page.getByRole('group', { name: /Payment frequency/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Monthly$/i })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Annually/i })).toHaveAttribute('aria-pressed', 'false');
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

    // Stripe success redirects to "/" and AppShell pushes the incomplete user
    // back to onboarding. Subscription success must resume at payments.
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    await expect(page.getByTestId('onboarding-flow')).toBeVisible();
    await expect(page.getByText(/Step 4 of 6 · Payments/i)).toBeVisible();

    const connectedAccountRequests: Array<{
      practice_email?: string;
      practice_uuid?: string;
      return_url?: string;
      refresh_url?: string;
    }> = [];
    await page.route('**/api/onboarding/connected-accounts', async (route) => {
      connectedAccountRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          practice_uuid: createdPractice.id,
          stripe_account_id: 'acct_e2e_onboarding',
          client_secret: null,
          url: 'https://connect.stripe.com/setup/s/e2e-onboarding',
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        }),
      });
    });

    await page.getByRole('button', { name: /Start Stripe setup/i }).click();
    await page.waitForURL(
      (url) => url.hostname === 'connect.stripe.com' || url.hostname === 'dashboard.stripe.com',
      { timeout: 30000 }
    );
    expect(connectedAccountRequests).toEqual([
      expect.objectContaining({
        practice_email: user.email,
        practice_uuid: createdPractice.id,
        return_url: expect.stringContaining('stripe=return'),
        refresh_url: expect.stringContaining('stripe=refresh'),
      }),
    ]);
    await page.goBack();
    await expect(page.getByText(/Step 4 of 6 · Payments/i)).toBeVisible();

    // 5. Steps 4 → 5 → 6
    await page.getByRole('button', { name: /Continue → Your intake form/i }).click();

    await expect(page.getByText(/Step 5 of 6 · Your intake form/i)).toBeVisible();
    await expect(page.getByText('Client preview')).toBeVisible();
    await expect(page.getByText('Collected on every intake')).toBeVisible();
    await expect(page.getByText('Required before submission')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Phone' })).toBeDisabled();
    await expect(page.getByText(/edit these questions/i)).toBeVisible();
    await page.getByRole('button', { name: /Continue → Share intake/i }).click();

    await expect(page.getByText(/Step 6 of 6 · Share intake/i)).toBeVisible();
    const previewPagePromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Open preview/i }).click();
    const previewPage = await previewPagePromise;
    await previewPage.waitForLoadState('domcontentloaded');
    await expect(previewPage).toHaveURL(/\/p\//);
    await expect(previewPage).toHaveURL(/ownerPreview=1/);
    await expect(previewPage).not.toHaveURL(/\/onboarding/);
    await expect(previewPage.getByText(/Preview mode: you are logged in as/i)).toBeVisible({ timeout: 30000 });
    await previewPage.close();

    const updateUserResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/auth/update-user') && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: /Open your workspace →/i }).click();
    const updateUserResponse = await updateUserResponsePromise;
    expect(updateUserResponse.ok(), 'onboarding completion must persist on the user session').toBe(true);

    expect(subscriptionConsoleErrors, 'subscription lookup should not produce browser console errors').toEqual([]);
    expect(
      subscriptionResponses.filter((response) => response.status === 403),
      '/api/subscriptions/current must not regress to the no-org 403'
    ).toEqual([]);

    await page.close();
  });
});
