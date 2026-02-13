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
}, testInfo) => {
  if (!e2eConfig) return;

  const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
  await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
  await waitForSession(anonPage, { timeoutMs: 30000 });

  const consoleErrors: string[] = [];
  const consoleLogs: string[] = [];
  anonPage.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    } else {
      consoleLogs.push(text);
    }
  });
  anonPage.on('pageerror', (error) => {
    consoleErrors.push(`[pageerror] ${error.message}`);
  });

  await anonPage.getByRole('button', { name: /request consultation/i }).click();

  const messageInput = anonPage.getByTestId('message-input');
  await expect(messageInput).toBeEnabled({ timeout: 15000 });

  const aiMessages = anonPage.getByTestId('ai-message');
  const initialAiCount = await aiMessages.count();

  await messageInput.fill('I need help with a divorce and custody issue. I am in Austin, TX.');
  await anonPage.getByRole('button', { name: /send message/i }).click();

  await expect(aiMessages).toHaveCount(initialAiCount + 1, { timeout: 30000 });
  const latestAiText = await aiMessages.nth((await aiMessages.count()) - 1).innerText();
  if (latestAiText.includes('I wasn\'t able to generate a response')) {
    await testInfo.attach('ai-fallback', { body: latestAiText, contentType: 'text/plain' });
    if (consoleLogs.length) {
      await testInfo.attach('console-logs', { body: consoleLogs.join('\n'), contentType: 'text/plain' });
    }
    if (consoleErrors.length) {
      await testInfo.attach('console-errors', { body: consoleErrors.join('\n'), contentType: 'text/plain' });
    }
    throw new Error('AI fallback response detected during intake flow.');
  }

  const readyButton = anonPage.getByRole('button', { name: /yes, i'm ready/i });
  await expect(readyButton).toBeVisible({ timeout: 30000 });
  await readyButton.click();

  await expect(anonPage.getByTestId('address-experience-form')).toBeVisible({ timeout: 15000 });

  const uniqueId = randomUUID().slice(0, 8);
  const email = `e2e+${uniqueId}@example.com`;
  const password = `Test${uniqueId}!23`;

  await anonPage.getByLabel('Name').fill(`E2E Lead ${uniqueId}`);
  await anonPage.getByLabel('Email').fill(email);
  await anonPage.getByLabel('Phone').fill('555-555-1212');
  await anonPage.getByLabel('City').fill('Austin');
  await anonPage.getByLabel('State').fill('TX');

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
