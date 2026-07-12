import { expect, test } from './fixtures.public';
const PRACTICE_SLUG = process.env.E2E_WIDGET_SLUG?.trim() || 'paul-yahoo';
const PUBLIC_BOOTSTRAP_CADENCE_MS = 16_000;

const ROUTES = [
  `/public/${encodeURIComponent(PRACTICE_SLUG)}?v=widget`,
];

test.describe('@responsive public routes', () => {
  for (const path of ROUTES) {
    test(`no horizontal overflow at viewport: ${path}`, async ({ anonPage }) => {
      await anonPage.waitForTimeout(PUBLIC_BOOTSTRAP_CADENCE_MS);
      await anonPage.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(anonPage.getByText("The page you're looking for doesn't exist.")).toHaveCount(0);
      await expect
        .poll(async () =>
          anonPage.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          )
        )
        .toBe(true);
    });
  }
});
