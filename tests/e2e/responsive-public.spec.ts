import { expect, test } from './fixtures.public';
import { resolveE2EPracticeSlug } from './helpers/e2eConfig';

const PRACTICE_SLUG = resolveE2EPracticeSlug('paul-yahoo', { allowWidgetOverride: true });

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
