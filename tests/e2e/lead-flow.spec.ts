import { expect, test } from './fixtures';
import { randomUUID } from 'crypto';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

const normalizePracticeSlug = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || trimmed;
    } catch {
      return trimmed;
    }
  }
  if (trimmed.includes('/')) {
    const segments = trimmed.split('/').filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  }
  return trimmed;
};

test.describe('Lead intake workflow', () => {
  test.describe.configure({ mode: 'serial', timeout: 90000 });
  test.skip(!e2eConfig, 'E2E credentials are not configured.');

  test('public intake prompts auth and lands on holding page', async ({
    anonContext,
    anonPage
  }) => {
    if (!e2eConfig) return;

    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(anonPage, { timeoutMs: 30000 });

    await anonPage.getByRole('button', { name: /request consultation/i }).click();

    await expect(anonPage.getByTestId('address-experience-form')).toBeVisible({ timeout: 15000 });

    const uniqueId = randomUUID().slice(0, 8);
    const email = `e2e+${uniqueId}@example.com`;
    const password = `Test${uniqueId}!23`;

    await anonPage.getByLabel('Name').fill(`E2E Lead ${uniqueId}`);
    await anonPage.getByLabel('Email').fill(email);

    const inviteResponsePromise = anonPage.waitForResponse((response) => (
      response.request().method() === 'POST'
      && response.url().includes('/api/practice/client-intakes/')
      && response.url().endsWith('/invite')
    ), { timeout: 30000 });

    await anonPage.getByTestId('contact-form-submit-footer').click();

    await expect(anonPage.getByText('Contact Information:', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(anonPage.getByRole('button', { name: 'Continue to finish intake' })).toBeVisible({ timeout: 15000 });

    await anonPage.getByRole('button', { name: 'Continue to finish intake' }).click();

    await expect(
      anonPage.getByLabel(/full name|name/i)
    ).toBeVisible({ timeout: 15000 });

    await anonPage.getByLabel(/name/i).fill(`E2E ${uniqueId}`);
    await anonPage.getByLabel(/email/i).fill(email);
    await anonPage.getByLabel(/password/i).first().fill(password);
    await anonPage.getByLabel(/confirm/i).fill(password);
    await anonPage.getByTestId('signup-submit-button').click();

    await anonPage.waitForURL(/\/auth\/awaiting-invite/);

    const inviteResponse = await inviteResponsePromise;
    if (!inviteResponse.ok()) {
      const bodyText = await inviteResponse.text().catch(() => '');
      throw new Error(`Invite trigger failed: ${inviteResponse.status()} ${bodyText}`);
    }
  });
});
