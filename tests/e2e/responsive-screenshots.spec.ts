import { expect, test } from './fixtures.auth';
import type { Page } from '@playwright/test';
import { resolveE2EPracticeSlug } from './helpers/e2eConfig';

const PRACTICE_SLUG = resolveE2EPracticeSlug('chris-luke-1');
const PUBLIC_PRACTICE_SLUG = process.env.E2E_WIDGET_SLUG?.trim() || 'paul-yahoo';
const PRACTICE_BASE = `/practice/${encodeURIComponent(PRACTICE_SLUG)}`;
const PUBLIC_BASE = `/public/${encodeURIComponent(PUBLIC_PRACTICE_SLUG)}`;
const PUBLIC_WIDGET = `${PUBLIC_BASE}?v=widget`;
const PUBLIC_DIRECT = PUBLIC_BASE;
const PUBLIC_WELCOME = `${PUBLIC_BASE}/welcome`;
const INTAKE_TEMPLATE = process.env.E2E_INTAKE_TEMPLATE ?? 'family-law';
const PUBLIC_BOOTSTRAP_CADENCE_MS = 16_000;
const OWNER_ROUTE_CADENCE_MS = 16_000;
const PUBLIC_INTAKE = `${PUBLIC_BASE}/intake/${encodeURIComponent(INTAKE_TEMPLATE)}`;

const ROUTES: Array<{ name: string; path: string; audience: 'public' | 'owner'; readyHeading?: string | RegExp }> = [
  // Public widget — three shells + intake-template path-param (was card, now Direct)
  { name: 'public-widget-embed', path: PUBLIC_WIDGET, audience: 'public' },
  { name: 'public-widget-direct', path: PUBLIC_DIRECT, audience: 'public' },
  { name: 'public-widget-intake', path: PUBLIC_INTAKE, audience: 'public' },
  { name: 'public-widget-welcome', path: PUBLIC_WELCOME, audience: 'public' },
  // Practice (authenticated)
  { name: 'practice-home', path: PRACTICE_BASE, audience: 'owner', readyHeading: /^Good (morning|afternoon|evening), .+\.$/ },
  { name: 'practice-matters', path: `${PRACTICE_BASE}/matters`, audience: 'owner', readyHeading: 'Matters' },
];

// CSS injected before each capture to suppress motion/cursor blink — common
// recipe for stabilizing Playwright screenshots. Without it, transitions in
// flight at capture time cause spurious diffs on rerun.
const FREEZE_STYLE = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  [data-testid="toast-container"] {
    display: none !important;
  }
`;

const stabilize = async (page: Page) => {
  await page.addStyleTag({ content: FREEZE_STYLE });
  // Wait for fonts so the first paint matches subsequent paints.
  await page.evaluate(async () => {
    await (document.fonts?.ready ?? Promise.resolve());
  });
};

test.describe('@responsive-screenshots @responsive', () => {
  for (const route of ROUTES) {
    test(`screenshot ${route.name}`, async ({ ownerPage, publicAnonPage }) => {
      const page = route.audience === 'public' ? publicAnonPage : ownerPage;
      const failedApiResponses: string[] = [];
      const recordFailedApiResponse = (response: { status: () => number; url: () => string }) => {
        const url = new URL(response.url());
        if (url.pathname.startsWith('/api/') && response.status() >= 400) {
          failedApiResponses.push(`${response.status()} ${url.pathname}`);
        }
      };
      page.on('response', recordFailedApiResponse);
      if (route.audience === 'public') {
        // Staging deliberately rate-limits anonymous widget bootstraps. Keep
        // visual coverage below that boundary instead of creating false 404s.
        await page.waitForTimeout(PUBLIC_BOOTSTRAP_CADENCE_MS);
      } else {
        // Auth/session and workspace bootstrap requests share the staging
        // limiter. Space owner captures so later viewport projects stay valid.
        await page.waitForTimeout(OWNER_ROUTE_CADENCE_MS);
      }
      await page.goto(route.path, { waitUntil: 'networkidle' });
      expect(failedApiResponses, 'Visual baselines must not capture failed API states').toEqual([]);
      await expect(page.getByText("The page you're looking for doesn't exist.")).toHaveCount(0);
      if (route.audience === 'public') {
        await expect(page.getByRole('button', { name: 'Send us a message' })).toBeVisible({ timeout: 15_000 });
      } else if (route.readyHeading) {
        await expect(page.getByRole('heading', { name: route.readyHeading, exact: typeof route.readyHeading === 'string' })).toBeVisible({ timeout: 15_000 });
      }
      await stabilize(page);
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        // DirectShell is viewport-fixed; Chromium's full-page stitch captures
        // its painted content as a blank frame. Other shells remain full-page.
        fullPage: route.name !== 'public-widget-direct' && route.name !== 'public-widget-intake',
        // Conservative starting list. Add data-testids on flaky regions and
        // include their locators here as we learn what drifts between runs.
        mask: [
          page.locator('[data-testid="dynamic-timestamp"]'),
          page.locator('[data-testid="dynamic-count"]'),
        ],
        maxDiffPixels: 100,
      });
    });
  }
});
