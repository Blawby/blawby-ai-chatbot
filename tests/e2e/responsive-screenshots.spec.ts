import { expect, test } from './fixtures.auth';
import type { Page } from '@playwright/test';

const PRACTICE_SLUG = process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';
const PRACTICE_BASE = `/practice/${encodeURIComponent(PRACTICE_SLUG)}`;
const PUBLIC_WIDGET = `/public/${encodeURIComponent(PRACTICE_SLUG)}?v=widget`;

const ROUTES: Array<{ name: string; path: string }> = [
  { name: 'public-widget', path: PUBLIC_WIDGET },
  { name: 'practice-home', path: PRACTICE_BASE },
  { name: 'practice-matters', path: `${PRACTICE_BASE}/matters` },
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
    test(`screenshot ${route.name}`, async ({ ownerPage }) => {
      await ownerPage.goto(route.path, { waitUntil: 'networkidle' });
      await stabilize(ownerPage);
      await expect(ownerPage).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
        // Conservative starting list. Add data-testids on flaky regions and
        // include their locators here as we learn what drifts between runs.
        mask: [
          ownerPage.locator('[data-testid="dynamic-timestamp"]'),
          ownerPage.locator('[data-testid="dynamic-count"]'),
        ],
        maxDiffPixels: 100,
      });
    });
  }
});
