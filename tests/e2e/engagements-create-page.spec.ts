import { expect, test } from './fixtures.auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();
const PRACTICE_SLUG = e2eConfig?.practice.slug ?? process.env.E2E_PRACTICE_SLUG ?? 'demo-owner-local';
const ENGAGEMENTS_BASE = `/practice/${encodeURIComponent(PRACTICE_SLUG)}/engagements`;
const CREATE_PATH = `${ENGAGEMENTS_BASE}/new`;

test.describe('engagements create page', () => {
  // Raise the per-test budget — staging API responses can be slow.
  test.setTimeout(60000);

  test('New Engagement button navigates to /new route', async ({ ownerPage }) => {
    await ownerPage.goto(ENGAGEMENTS_BASE, { waitUntil: 'domcontentloaded' });

    // Target either the desktop header button or the mobile FAB.
    const newButton = ownerPage.locator('button, a').filter({ hasText: /new engagement/i }).first();
    await newButton.waitFor({ state: 'visible', timeout: 20000 });
    await newButton.click();

    await ownerPage.waitForURL(`**${CREATE_PATH}**`, { timeout: 10000 });
    expect(ownerPage.url()).toContain(CREATE_PATH);
  });

  test('create page renders required sections', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    // h1 — generous timeout absorbs Preact hydration on cold nav.
    await expect(ownerPage.locator('h1').filter({ hasText: 'New Engagement' })).toBeVisible({ timeout: 20000 });

    await expect(ownerPage.getByText(/source intake/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/client & matter/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/scope of representation/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/contract body/i).first()).toBeVisible();
  });

  test('client preview panel visible on desktop viewport', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1440, height: 900 });
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    await expect(ownerPage.getByText(/client preview/i)).toBeVisible({ timeout: 20000 });
    await expect(ownerPage.getByText(/engagement agreement/i)).toBeVisible();
  });

  test('billing type radio group is present and selectable', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    // RadioGroupWithDescriptions renders sr-only radio inputs — use radio role to locate them.
    const hourly = ownerPage.getByRole('radio', { name: /hourly/i });
    await expect(hourly).toBeVisible({ timeout: 20000 });
    await expect(ownerPage.getByRole('radio', { name: /fixed fee/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /contingency/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /retainer/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /pro bono/i })).toBeVisible();

    // Clicking uses force:true because the input is sr-only and its label intercepts pointer
    // events — we want to trigger the input directly, not via the label overlay.
    const fixedFee = ownerPage.getByRole('radio', { name: /fixed fee/i });
    await fixedFee.click({ force: true });
    await expect(fixedFee).toBeChecked();
    await expect(hourly).not.toBeChecked();

    // Mutual exclusion: switching back unchecks Fixed fee.
    await hourly.click({ force: true });
    await expect(hourly).toBeChecked();
    await expect(fixedFee).not.toBeChecked();
  });

  test('submit without intake shows validation error', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    const submitButton = ownerPage.getByRole('button', { name: /create engagement/i });
    await submitButton.waitFor({ state: 'visible', timeout: 20000 });
    await submitButton.click();

    await expect(ownerPage.getByText(/accepted intake is required/i)).toBeVisible({ timeout: 5000 });
  });

  test('cancel button returns to engagements list', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    const cancelButton = ownerPage.getByRole('button', { name: /cancel/i }).first();
    await cancelButton.waitFor({ state: 'visible', timeout: 20000 });
    await cancelButton.click();

    await ownerPage.waitForURL(`**${ENGAGEMENTS_BASE}`, { timeout: 10000 });
    expect(ownerPage.url()).not.toContain('/new');
  });

  test('no horizontal overflow on create page', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });
    await ownerPage.waitForLoadState('networkidle').catch(() => undefined);

    const noOverflow = await ownerPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(noOverflow).toBe(true);
  });
});
