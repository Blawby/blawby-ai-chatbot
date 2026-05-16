// Codifies the production regression: a subscribed user with `active_organization_id`
// null on the session was hard-redirected to /pricing on cold login. The fix gates
// the redirect on practice-membership presence and auto-activates the first practice
// via the shared `useEnsureActiveOrganization` hook.
//
// SC2 (zero-practice user STILL routes to /pricing) is verified manually rather
// than automated here. Building a "completed onboarding + zero practices" fixture
// requires backend coordination beyond this plan's scope. Manual repro: register
// a fresh user with no organization memberships, complete onboarding, navigate to
// `/`, and confirm the redirect to `/pricing` still fires.

import { expect, test } from './fixtures.auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

test.describe('Pricing gate uses practice membership', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test('subscribed-owner cold login lands on workspace home, not /pricing', async ({ unauthContext, baseURL }) => {
    if (!e2eConfig) return;

    const page = await unauthContext.newPage();

    const visitedUrls: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        visitedUrls.push(frame.url());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Routed to /auth on a cold visit because the session is empty.
    await page.waitForURL(/\/auth/, { timeout: 30000 });

    await page.getByTestId('signin-email-input').fill(e2eConfig.owner.email);
    await page.getByTestId('signin-password-input').fill(e2eConfig.owner.password);
    await page.getByTestId('signin-submit-button').click();

    // After sign-in the gate must NOT redirect to /pricing — instead the user
    // should land on their practice or client workspace home.
    await page.waitForURL((url) => {
      const path = new URL(url).pathname;
      return path.startsWith('/practice/') || path.startsWith('/client/');
    }, { timeout: 30000 });

    // SC3: no /pricing URL appears in the navigation history.
    const pricingHits = visitedUrls.filter((url) => new URL(url).pathname === '/pricing');
    expect(pricingHits, `unexpected /pricing in navigation history: ${visitedUrls.join(', ')}`).toHaveLength(0);

    // The recovery hook should have populated active_organization_id on the session.
    const cookies = await unauthContext.cookies(baseURL);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const sessionResponse = await unauthContext.request.get('/api/auth/get-session', {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    });
    expect(sessionResponse.ok()).toBe(true);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody?.session?.active_organization_id, 'recovery hook should have set active_organization_id').toBeTruthy();

    await page.close();
  });
});
