import { expect, test } from './fixtures.auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();
const PRACTICE_SLUG = e2eConfig?.practice.slug ?? process.env.E2E_PRACTICE_SLUG ?? 'demo-owner-local';
const ENGAGEMENTS_BASE = `/practice/${encodeURIComponent(PRACTICE_SLUG)}/engagements`;
const CREATE_PATH = `${ENGAGEMENTS_BASE}/new`;

test.describe('engagements create page', () => {
  test('New Engagement button navigates to /new route', async ({ ownerPage }) => {
    await ownerPage.goto(ENGAGEMENTS_BASE, { waitUntil: 'domcontentloaded' });

    // The button may be hidden on small viewports — target either the desktop header
    // button or the mobile FAB.
    const newButton = ownerPage.locator('button, a').filter({ hasText: /new engagement/i }).first();
    await newButton.waitFor({ state: 'visible', timeout: 10000 });
    await newButton.click();

    await ownerPage.waitForURL(`**${CREATE_PATH}**`, { timeout: 8000 });
    expect(ownerPage.url()).toContain(CREATE_PATH);
  });

  test('create page renders required sections', async ({ ownerPage }) => {
    // Land on the list first so the workspace shell fully initialises, then push to /new.
    await ownerPage.goto(ENGAGEMENTS_BASE, { waitUntil: 'domcontentloaded' });
    await ownerPage.waitForLoadState('networkidle').catch(() => undefined);
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });
    await ownerPage.waitForLoadState('networkidle').catch(() => undefined);

    // Page heading (h1)
    await expect(ownerPage.locator('h1').filter({ hasText: 'New Engagement' })).toBeVisible({ timeout: 8000 });

    // Section headings
    await expect(ownerPage.getByText(/source intake/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/client & matter/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/scope of representation/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/contract body/i).first()).toBeVisible();
  });

  test('client preview panel visible on desktop viewport', async ({ ownerPage }) => {
    // Only rendered at xl breakpoint — use a wide viewport
    await ownerPage.setViewportSize({ width: 1440, height: 900 });
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    await expect(ownerPage.getByText(/client preview/i)).toBeVisible({ timeout: 8000 });
    await expect(ownerPage.getByText(/engagement agreement/i)).toBeVisible();
  });

  test('billing type radio group is present and selectable', async ({ ownerPage }) => {
    await ownerPage.goto(ENGAGEMENTS_BASE, { waitUntil: 'domcontentloaded' });
    await ownerPage.waitForLoadState('networkidle').catch(() => undefined);
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });
    await ownerPage.waitForLoadState('networkidle').catch(() => undefined);

    // Billing type options rendered by RadioGroupWithDescriptions — use radio role to avoid
    // matching duplicate text nodes from label + inner span.
    await expect(ownerPage.getByRole('radio', { name: /hourly/i })).toBeVisible({ timeout: 8000 });
    await expect(ownerPage.getByRole('radio', { name: /fixed fee/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /contingency/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /retainer/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /pro bono/i })).toBeVisible();
  });

  test('submit without intake shows validation error', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    const submitButton = ownerPage.getByRole('button', { name: /create engagement/i });
    await submitButton.waitFor({ state: 'visible', timeout: 8000 });
    await submitButton.click();

    await expect(ownerPage.getByText(/accepted intake is required/i)).toBeVisible({ timeout: 5000 });
  });

  test('cancel button returns to engagements list', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    const cancelButton = ownerPage.getByRole('button', { name: /cancel/i }).first();
    await cancelButton.waitFor({ state: 'visible', timeout: 8000 });
    await cancelButton.click();

    await ownerPage.waitForURL(`**${ENGAGEMENTS_BASE}`, { timeout: 8000 });
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
