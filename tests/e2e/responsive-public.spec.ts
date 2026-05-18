import { expect, test } from './fixtures.public';

const PRACTICE_SLUG = process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';

const ROUTES = [
  `/public/${encodeURIComponent(PRACTICE_SLUG)}?v=widget`,
];

test.describe('@responsive public routes', () => {
  for (const path of ROUTES) {
    test(`no horizontal overflow at viewport: ${path}`, async ({ anonPage }) => {
      await anonPage.goto(path, { waitUntil: 'domcontentloaded' });
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
