import { expect, test } from './fixtures.auth';
import { resolveE2EPracticeSlug } from './helpers/e2eConfig';

const PRACTICE_SLUG = resolveE2EPracticeSlug('paul-yahoo');
const PRACTICE_BASE = `/practice/${encodeURIComponent(PRACTICE_SLUG)}`;

// Routes mirror the practice rail in src/shared/config/navConfig.ts.
const PRACTICE_ROUTES = [
  PRACTICE_BASE,
  `${PRACTICE_BASE}/matters`,
  `${PRACTICE_BASE}/conversations`,
  `${PRACTICE_BASE}/contacts`,
  `${PRACTICE_BASE}/intakes`,
  `${PRACTICE_BASE}/files`,
  `${PRACTICE_BASE}/invoices`,
  `${PRACTICE_BASE}/reports`,
  `${PRACTICE_BASE}/coverage`,
  `${PRACTICE_BASE}/settings/general`,
];

test.describe('@responsive practice routes', () => {
  for (const path of PRACTICE_ROUTES) {
    test(`no horizontal overflow: ${path}`, async ({ ownerPage }) => {
      await ownerPage.goto(path, { waitUntil: 'domcontentloaded' });
      await expect
        .poll(async () =>
          ownerPage.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          )
        )
        .toBe(true);
    });
  }
});
