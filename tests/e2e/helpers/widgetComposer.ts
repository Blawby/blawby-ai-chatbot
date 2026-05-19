import type { Page, Locator } from '@playwright/test';

/**
 * Bring a fresh public-widget Page into the "composer ready" state — through
 * the slim contact form, the disclaimer, and the consultation CTA, in
 * whatever order the widget presents them. Returns the message-input locator
 * once the composer is enabled.
 *
 * Polls every ~200ms up to a 60s deadline. Failure is asserted via the
 * Playwright `expect` from the test that drives this helper (the helper
 * stays neutral by throwing instead).
 */
export const prepareWidgetComposer = async (
  page: Page,
  contactName: string,
  contactEmail: string,
  contactPhone: string = '5555551212',
): Promise<{ messageInput: Locator }> => {
  const messageInput = page.getByTestId('message-input');
  const consultationCta = page.getByRole('button', { name: /request consultation/i }).first();
  const slimFormName = page.locator(
    'input[placeholder*="full name" i], input[name="name"], label:has-text("Name") + input',
  ).first();
  const slimFormEmail = page.locator('input[type="email"]').first();
  const slimFormPhone = page.locator('input[type="tel"]').first();
  const slimFormContinue = page.getByRole('button', { name: /continue/i }).first();
  const disclaimerButton = page.getByRole('button', { name: /accept|understand|agree|disclaimer/i }).first();

  const deadline = Date.now() + 60_000;
  let ctaClicked = false;
  let lastStep = 'init';

  while (Date.now() < deadline) {
    if (await messageInput.isEnabled({ timeout: 250 }).catch(() => false)) {
      return { messageInput };
    }

    if (await slimFormContinue.isVisible({ timeout: 250 }).catch(() => false)) {
      if (await slimFormName.isVisible({ timeout: 250 }).catch(() => false)) {
        await slimFormName.fill(contactName, { timeout: 1000 }).catch(() => undefined);
      }
      if (await slimFormEmail.isVisible({ timeout: 250 }).catch(() => false)) {
        await slimFormEmail.fill(contactEmail, { timeout: 1000 }).catch(() => undefined);
      }
      if (await slimFormPhone.isVisible({ timeout: 250 }).catch(() => false)) {
        await slimFormPhone.fill(contactPhone, { timeout: 1000 }).catch(() => undefined);
      }
      if (await slimFormContinue.isEnabled({ timeout: 250 }).catch(() => false)) {
        await slimFormContinue.click({ timeout: 1000, noWaitAfter: true }).catch(() => undefined);
        lastStep = 'slim-form-submitted';
        await page.waitForTimeout(500);
      }
      continue;
    }

    if (await disclaimerButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await disclaimerButton.click({ timeout: 5000, noWaitAfter: true }).catch(() => undefined);
      lastStep = 'disclaimer-accepted';
      continue;
    }

    if (!ctaClicked && await consultationCta.isVisible({ timeout: 500 }).catch(() => false)) {
      await consultationCta.click({ timeout: 1000, noWaitAfter: true }).catch(() => undefined);
      lastStep = 'cta-clicked';
      ctaClicked = true;
      await page.waitForTimeout(300);
      continue;
    }

    await page.waitForTimeout(200);
  }

  throw new Error(`prepareWidgetComposer: composer never enabled. Last step: ${lastStep}`);
};

export const buildWidgetUrl = (practiceSlug: string): string =>
  `/public/${encodeURIComponent(practiceSlug)}?v=widget`;
