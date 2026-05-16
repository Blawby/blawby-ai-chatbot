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

    // The audit verified the /pricing flash used history.replaceState rather
    // than a full frame navigation, which means `page.on('framenavigated')`
    // alone won't catch it. Instrument pushState AND replaceState BEFORE the
    // page script runs so every URL change — frame navigation or pushState
    // mutation — ends up in __navHistory.
    await page.addInitScript(() => {
      const w = window as unknown as { __navHistory?: string[] };
      w.__navHistory = [];
      const push = history.pushState.bind(history);
      const replace = history.replaceState.bind(history);
      history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
        if (url != null) w.__navHistory!.push(String(url));
        return push(data as never, unused, url as never);
      };
      history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
        if (url != null) w.__navHistory!.push(String(url));
        return replace(data as never, unused, url as never);
      };
    });

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

    // SC3: no /pricing URL appears in either navigation history source.
    const pricingFrameHits = visitedUrls.filter((url) => new URL(url).pathname === '/pricing');
    expect(
      pricingFrameHits,
      `unexpected /pricing in framenavigated history: ${visitedUrls.join(', ')}`
    ).toHaveLength(0);

    const navHistory = await page.evaluate(
      () => (window as unknown as { __navHistory?: string[] }).__navHistory ?? []
    );
    const pricingReplaceHits = navHistory.filter((entry) => entry.includes('/pricing'));
    expect(
      pricingReplaceHits,
      `unexpected /pricing in pushState/replaceState history: ${navHistory.join(', ')}`
    ).toHaveLength(0);
    // Same regression guard for the discarded /client/dashboard flash hypothesis.
    const clientDashboardHits = navHistory.filter((entry) =>
      entry.includes('/client/dashboard')
    );
    expect(
      clientDashboardHits,
      `unexpected /client/dashboard in pushState/replaceState history: ${navHistory.join(', ')}`
    ).toHaveLength(0);

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

  test('direct navigation to a deep workspace URL does not flash /pricing', async ({ unauthContext, baseURL }) => {
    if (!e2eConfig) return;

    const page = await unauthContext.newPage();

    await page.addInitScript(() => {
      const w = window as unknown as { __navHistory?: string[] };
      w.__navHistory = [];
      const push = history.pushState.bind(history);
      const replace = history.replaceState.bind(history);
      history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
        if (url != null) w.__navHistory!.push(String(url));
        return push(data as never, unused, url as never);
      };
      history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
        if (url != null) w.__navHistory!.push(String(url));
        return replace(data as never, unused, url as never);
      };
    });

    // Sign in first via the same flow as the cold-login test.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth/, { timeout: 30000 });
    await page.getByTestId('signin-email-input').fill(e2eConfig.owner.email);
    await page.getByTestId('signin-password-input').fill(e2eConfig.owner.password);
    await page.getByTestId('signin-submit-button').click();
    await page.waitForURL((url) => {
      const path = new URL(url).pathname;
      return path.startsWith('/practice/') || path.startsWith('/client/');
    }, { timeout: 30000 });

    // Now reset the nav-history buffer and go directly to a deep workspace URL.
    // The audit reproduced /pricing flashing on direct navigation to URLs like
    // /practice/<slug>/settings/account even with a valid session.
    const landingPath = new URL(page.url()).pathname;
    await page.evaluate(() => {
      const w = window as unknown as { __navHistory?: string[] };
      w.__navHistory = [];
    });
    await page.goto(`${landingPath}/settings/account`, { waitUntil: 'domcontentloaded' });

    const navHistory = await page.evaluate(
      () => (window as unknown as { __navHistory?: string[] }).__navHistory ?? []
    );
    const pricingHits = navHistory.filter((entry) => entry.includes('/pricing'));
    expect(
      pricingHits,
      `direct-URL nav produced /pricing entries: ${navHistory.join(', ')}`
    ).toHaveLength(0);

    await page.close();
  });
});
