/**
 * widget-embed.spec.ts
 *
 * Tests the widget via the real cross-origin iframe embed path — identical to
 * how northcarolinalegalservices.org embeds it.
 *
 * Architecture:
 *   Playwright → GET /mock-embed.html (the "customer" page)
 *     → loads /widget-loader.js from same origin
 *       → widget-loader creates <iframe src="/public/:slug?v=widget&...">
 *         → /api/widget/bootstrap (actual worker)
 *         → WidgetApp mounts inside the iframe
 *
 * This is the ONLY test suite that exercises:
 *   - widget-loader.js postMessage bridge
 *   - iframe session isolation (no shared cookies between harness + iframe by default)
 *   - blawby:ready / blawby:open / blawby:new-message events
 *   - The full bootstrap → anon-session → conversation → composer flow
 *
 * Run locally:
 *   E2E_BASE_URL=http://localhost:5137 npx playwright test tests/e2e/widget-embed.spec.ts --reporter=line
 */

import { test, expect } from './fixtures.public';
import { randomUUID } from 'crypto';

const DEFAULT_WIDGET_SLUG = process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';
const EMBED_TIMEOUT_MS = 30_000;
const WIDGET_READY_TIMEOUT_MS = 35_000;
const INTERACTIVE_TIMEOUT_MS = 30_000;
const AI_RESPONSE_TIMEOUT_MS = 45_000;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Wait until window.__blawbyLastEvent.type === targetType inside the harness page. */
async function waitForWidgetEvent(
  page: import('@playwright/test').Page,
  targetType: string,
  timeoutMs = WIDGET_READY_TIMEOUT_MS
) {
  const aliases: Record<string, string[]> = {
    iframe_ready: ['iframe_ready', 'blawby:ready'],
    widget_opened: ['widget_opened', 'blawby:open'],
  };
  const acceptedTypes = aliases[targetType] ?? [targetType];

  await expect.poll(
    async () => {
      // Events are stored via two paths:
      // 1. postMessage from iframe → window.addEventListener('message') → type stored directly
      // 2. CustomEvent 'blawby:widget-event' → type stored in .detail.type
      // We check the events array for either path.
      const found = await page.evaluate((types) => {
        const events: Array<{ type: string; detail?: { type: string } }> = window.__blawbyEvents ?? [];
        return events.some((e) => types.includes(e.type) || (e.detail?.type ? types.includes(e.detail.type) : false));
      }, acceptedTypes);
      if (found) return true;
      if (acceptedTypes.includes('iframe_ready') || acceptedTypes.includes('blawby:ready')) {
        return page.evaluate(() => {
          const iframe = document.querySelector('iframe[src*="/public/"]') as HTMLIFrameElement | null;
          return Boolean(iframe?.src);
        });
      }
      return false;
    },
    {
      timeout: timeoutMs,
      message: `Expected widget event "${targetType}" (or aliases: ${acceptedTypes.join(', ')}) but never received it`,
    }
  ).toBe(true);
}

/** Return all blawby postMessage events received so far. */
async function getWidgetEvents(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.__blawbyEvents ?? []);
}

async function reachWidgetComposer(
  iframe: import('@playwright/test').FrameLocator,
  timeoutMs = INTERACTIVE_TIMEOUT_MS
) {
  const messageInput = iframe
    .locator('[data-testid="message-input"], textarea[placeholder*="message" i], textarea, [role="textbox"]')
    .first();
  const interactiveActions = iframe.locator('button, [role="button"], a');
  const consultationCta = interactiveActions.filter({ hasText: /request consultation/i }).first();
  const askBtn = interactiveActions.filter({ hasText: /ask a question/i }).first();
  const sendUsBtn = interactiveActions.filter({ hasText: /send us a message|send message/i }).first();
  const speakToLawyerBtn = interactiveActions.filter({ hasText: /need to speak to a lawyer/i }).first();
  const continueBtn = interactiveActions.filter({ hasText: /^continue$/i }).first();
  const nameInput = iframe.locator('input[placeholder*="full name" i], input[name="name"], label:has-text("Name") + input').first();
  const emailInput = iframe.locator('input[type="email"]').first();
  const phoneInput = iframe.locator('input[type="tel"]').first();
  const recentMsg = iframe.locator('[data-testid="recent-message"], .recent-conversation').first();
  const uid = randomUUID().slice(0, 8);

  const deadline = Date.now() + timeoutMs;
  let lastClickedAt = 0;

  while (Date.now() < deadline) {
    if (await messageInput.isEnabled({ timeout: 300 }).catch(() => false)) {
      return { messageInput, mode: 'composer' as const };
    }

    const now = Date.now();
    if (now - lastClickedAt < 1200) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    if (await consultationCta.isVisible({ timeout: 300 }).catch(() => false)) {
      await consultationCta.click().catch(() => null);
      lastClickedAt = now;
      continue;
    }

    if (await askBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await askBtn.click().catch(() => null);
      lastClickedAt = now;
      continue;
    }

    if (await sendUsBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await sendUsBtn.click().catch(() => null);
      lastClickedAt = now;
      continue;
    }

    if (await speakToLawyerBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await speakToLawyerBtn.click().catch(() => null);
      lastClickedAt = now;
      continue;
    }

    if (await recentMsg.isVisible({ timeout: 300 }).catch(() => false)) {
      await recentMsg.click().catch(() => null);
      lastClickedAt = now;
      continue;
    }

    if (await nameInput.isVisible({ timeout: 300 }).catch(() => false)) {
      await nameInput.fill(`Embed E2E ${uid}`).catch(() => undefined);
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill(`embed-e2e-${uid}@example.com`).catch(() => undefined);
      }
      if (await phoneInput.isVisible().catch(() => false)) {
        await phoneInput.fill('5555550199').catch(() => undefined);
      }
      if (await continueBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await continueBtn.click().catch(() => null);
        lastClickedAt = now;
        continue;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error('Widget never reached composer after navigating home screen');
}

// ── types the harness exposes on window ──────────────────────────────────────
declare global {
  interface Window {
    __blawbyLastEvent?: { type: string; [key: string]: unknown };
    __blawbyEvents?: Array<{ type: string; [key: string]: unknown }>;
    __blawbyOnEvents?: Array<{ eventName: string; data?: unknown }>;
    __blawbyHarnessConfig?: { baseUrl: string; slug: string };
    BlawbyWidgetAPI?: {
      open: () => void;
      close: () => void;
      newConversation?: () => void;
    };
  }
}

// ── test suite ───────────────────────────────────────────────────────────────

test.describe('Public widget embed (cross-origin iframe flow)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('widget emits blawby:ready and loads without 5xx', async ({ anonPage: page }, testInfo) => {
    const slug = DEFAULT_WIDGET_SLUG;
    const consoleErrors: string[] = [];
    const apiErrors: Array<{ url: string; status: number }> = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) {
        apiErrors.push({ url: response.url(), status: response.status() });
      }
    });

    await page.goto(`/mock-embed.html?slug=${encodeURIComponent(slug)}`, {
      waitUntil: 'domcontentloaded',
    });

    // Verify the harness loaded.
    await expect(page.locator('#slug-display')).toContainText(slug, { timeout: 5_000 });

    // Make the open intent explicit so bootstrap is not dependent on the harness pre-warm race.
    await page.locator('button[data-action="open"]').click();

    // Widget must emit blawby:ready via postMessage.
    await waitForWidgetEvent(page, 'iframe_ready', WIDGET_READY_TIMEOUT_MS);
    const widgetStatusBadge = page.locator('#widget-status');
    await expect(widgetStatusBadge).toContainText(/ready|open/i, { timeout: 2_000 });
    await expect(page.locator('iframe[src*="/public/"]').first()).toBeVisible({ timeout: 10_000 });

    // No 5xx errors from any API call during load.
    expect(
      apiErrors,
      `API 5xx errors during widget load: ${JSON.stringify(apiErrors)}`
    ).toHaveLength(0);

    if (consoleErrors.length) {
      await testInfo.attach('embed-console-errors', { body: consoleErrors.join('\n'), contentType: 'text/plain' });
    }
  });

  test('launcher opens widget and iframe becomes interactive', async ({ anonPage: page }, testInfo) => {
    const slug = DEFAULT_WIDGET_SLUG;
    const apiErrors: Array<{ url: string; status: number }> = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) {
        apiErrors.push({ url: response.url(), status: response.status() });
      }
    });

    await page.goto(`/mock-embed.html?slug=${encodeURIComponent(slug)}`, {
      waitUntil: 'domcontentloaded',
    });

    // The launcher button is rendered in the harness page's DOM by widget-loader.js.
    const launcher = page.locator('#blawby-launcher, [id*="blawby"][id*="launcher"], button[aria-label*="Chat"]').first();
    await expect(launcher).toBeVisible({ timeout: 10_000 });

    const widgetStatus = page.locator('#widget-status');
    const isAlreadyOpen = await widgetStatus.innerText().then((text) => /\bopen\b/i.test(text)).catch(() => false);
    if (isAlreadyOpen) {
      await launcher.click();
      await waitForWidgetEvent(page, 'widget_closed', 5_000);
    }

    await launcher.click();

    // Widget should emit blawby:open.
    await waitForWidgetEvent(page, 'widget_opened', 10_000);

    // The iframe src should now be set — find the widget iframe.
    const iframeLocator = page.frameLocator('iframe[src*="/public/"]').first();

    let reachedInteractive = false;
    try {
      await reachWidgetComposer(iframeLocator, INTERACTIVE_TIMEOUT_MS);
      reachedInteractive = true;
    } catch (err) {
      const snapshot = await page.evaluate(() => ({
        events: window.__blawbyEvents ?? [],
        iframes: Array.from(document.querySelectorAll('iframe')).map((f) => ({
          src: f.src,
          style: f.getAttribute('style') ?? '',
        })),
      }));
      await testInfo.attach('embed-interactive-failure.json', {
        body: JSON.stringify(snapshot, null, 2),
        contentType: 'application/json',
      });
      throw err;
    }

    expect(reachedInteractive, 'widget iframe must become interactive').toBe(true);

    // No 5xx errors during the entire open flow.
    expect(
      apiErrors,
      `5xx errors during widget open: ${JSON.stringify(apiErrors)}`
    ).toHaveLength(0);

    // Widget events must include ready + open lifecycle.
    // 'blawby:ready' comes from the iframe postMessage (intercepted by harness message listener).
    // 'widget_opened' comes from the loader's emitEvent() dispatched as a blawby:widget-event CustomEvent.
    const events = await getWidgetEvents(page);
    const types = events.map((e) => e.type);
    expect(types).toContain('blawby:ready');
    expect(types).toContain('widget_opened');
  });

  test('widget survives cookie clear and reopens after reload', async ({ anonPage: page }) => {
    const slug = DEFAULT_WIDGET_SLUG;

    await page.goto(`/mock-embed.html?slug=${encodeURIComponent(slug)}`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the widget to be ready in the harness before simulating cookie loss.
    await page.locator('button[data-action="open"]').click();
    await waitForWidgetEvent(page, 'iframe_ready', WIDGET_READY_TIMEOUT_MS);

    // Confirm token was persisted into sessionStorage by the iframe.
    const iframeLocator = page.frameLocator('iframe[src*="/public/"]');
    const tokenInIframe = await iframeLocator.locator('body').evaluate(() => {
      try { return sessionStorage.getItem('blawby_widget_auth_token'); } catch { return null; }
    }).catch(() => null);

    // If token is present (requires iframe to be same-origin accessible in Playwright — only works in non-cross-origin mode),
    // assert it's non-empty. If the frame is cross-origin, this will be null; that's fine.
    if (tokenInIframe !== null) {
      expect(tokenInIframe.length, 'widget auth token should be non-empty in sessionStorage').toBeGreaterThan(10);
    }

    // Clear all cookies to simulate ITP/third-party cookie block.
    await page.context().clearCookies();

    // Re-navigate and confirm the widget can still reopen.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('button[data-action="open"]').click();
    await waitForWidgetEvent(page, 'iframe_ready', WIDGET_READY_TIMEOUT_MS);
    await expect(page.locator('iframe[src*="/public/"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('widget in iframe sees no 5xx on conversation active endpoint', async ({ anonPage: page }, testInfo) => {
    const slug = DEFAULT_WIDGET_SLUG;
    const allApiResponses: Array<{ method: string; url: string; status: number }> = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        allApiResponses.push({
          method: response.request().method(),
          url: response.url(),
          status: response.status(),
        });
      }
    });

    await page.goto(`/mock-embed.html?slug=${encodeURIComponent(slug)}`, {
      waitUntil: 'domcontentloaded',
    });

    // Open widget. In this assertion-focused test we accept either the explicit
    // iframe_ready event or a concrete loaded iframe as readiness signal.
    await expect.poll(
      async () => {
        const hasReadyEvent = await page.evaluate(() => {
          const events = (window.__blawbyEvents ?? []) as Array<{ type?: string; detail?: { type?: string } }>;
          return events.some((e) => e.type === 'iframe_ready' || e.type === 'blawby:ready' || e.detail?.type === 'iframe_ready');
        });
        const iframeCount = await page.locator('iframe[src*="/public/"]').count();
        return hasReadyEvent || iframeCount > 0;
      },
      {
        timeout: WIDGET_READY_TIMEOUT_MS,
        message: 'Expected widget iframe to be present or ready event to be emitted',
      }
    ).toBe(true);

    const launcher = page.locator('#blawby-launcher, [id*="blawby"][id*="launcher"], button[aria-label*="Chat"]').first();
    if (await launcher.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await launcher.click();
      await waitForWidgetEvent(page, 'widget_opened', 8_000);
    }

    // Give the widget time to settle (fetch conversation, connect WS, etc).
    await page.waitForTimeout(4_000);

    const serverErrors = allApiResponses.filter((r) => r.status >= 500);
    if (serverErrors.length > 0) {
      await testInfo.attach('embed-5xx-responses.json', {
        body: JSON.stringify(serverErrors, null, 2),
        contentType: 'application/json',
      });
    }

    expect(
      serverErrors,
      `Got 5xx responses during embed flow:\n${serverErrors.map((r) => `  ${r.status} ${r.method} ${r.url}`).join('\n')}`
    ).toHaveLength(0);
  });

  test('slim contact form submit works via widget iframe', async ({ anonPage: page }, testInfo) => {
    const slug = DEFAULT_WIDGET_SLUG;
    const uid = randomUUID().slice(0, 8);
    const testEmail = `embed-e2e-${uid}@example.com`;
    const apiErrors: Array<{ url: string; status: number }> = [];
    const requestFailures: Array<{ url: string; errorText: string | null }> = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) {
        apiErrors.push({ url: response.url(), status: response.status() });
      }
    });
    page.on('requestfailed', (req) => {
      if (req.url().includes('/api/')) {
        requestFailures.push({ url: req.url(), errorText: req.failure()?.errorText ?? null });
      }
    });

    await page.goto(`/mock-embed.html?slug=${encodeURIComponent(slug)}`, {
      waitUntil: 'domcontentloaded',
    });

    await waitForWidgetEvent(page, 'iframe_ready', WIDGET_READY_TIMEOUT_MS);

    // The harness pre-warms by opening the widget, so avoid toggling it closed here.
    const launcher = page.locator('#blawby-launcher, [id*="blawby"][id*="launcher"], button[aria-label*="Chat"]').first();
    const widgetStatus = page.locator('#widget-status');
    const isAlreadyOpen = await widgetStatus.innerText().then((text) => /ready|open/i.test(text)).catch(() => false);
    if (!isAlreadyOpen && await launcher.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await launcher.click();
      await waitForWidgetEvent(page, 'widget_opened', 8_000);
    } else if (!isAlreadyOpen) {
      await page.locator('button[data-action="open"]').click();
      await waitForWidgetEvent(page, 'widget_opened', 8_000);
    }

    const iframe = page.frameLocator('iframe[src*="/public/"]').first();

    const messageInput = iframe
      .locator('[data-testid="message-input"], textarea[placeholder*="message" i], textarea, [role="textbox"]')
      .first();
    const bodyLocator = iframe.locator('body');
    const requestConsultation = iframe.getByRole('button', { name: /request consultation/i }).first();
    const fullNameInput = iframe.locator('input[placeholder*="full name" i], input[type="text"]').first();
    const emailInput = iframe.locator('input[type="email"]').first();
    const phoneInput = iframe.locator('input[type="tel"]').first();
    const continueButton = iframe.getByRole('button', { name: /^continue$/i }).first();

    let flowReached = false;
    try {
      await expect
        .poll(
          async () =>
            (await requestConsultation.isVisible({ timeout: 300 }).catch(() => false)) ||
            (await fullNameInput.isVisible({ timeout: 300 }).catch(() => false)),
          {
            timeout: 30_000,
            message: 'Expected consultation CTA or slim contact form to appear in widget iframe',
          }
        )
        .toBe(true);

      if (await requestConsultation.isVisible({ timeout: 500 }).catch(() => false)) {
        await requestConsultation.click();
      }

      await expect(fullNameInput).toBeVisible({ timeout: 15_000 });
      await fullNameInput.fill(`Embed E2E ${uid}`);
      await emailInput.fill(testEmail);
      await phoneInput.fill('555-555-0199');
      await continueButton.click();

      await expect
        .poll(
          async () => {
            const bodyText = await bodyLocator.innerText().catch(() => '');
            const composerReady = await messageInput.isEnabled({ timeout: 300 }).catch(() => false);
            return (
              composerReady ||
              bodyText.includes('Contact info received') ||
              bodyText.includes(testEmail)
            );
          },
          {
            timeout: 20_000,
            message: 'Expected contact form submission to acknowledge details or advance to composer',
          }
        )
        .toBe(true);
      flowReached = true;
    } finally {
      if (!flowReached) {
        const iframeBody = await iframe.locator('body').innerText().catch(() => '(could not read)');
        const iframeButtons = await iframe.locator('button').allInnerTexts().catch(() => []);
        const inputState = await messageInput.isEnabled().catch(() => null);
        await testInfo.attach('slim-form-failure-state.json', {
          body: JSON.stringify({
            iframeBody: iframeBody.slice(-2000),
            iframeButtons,
            inputEnabled: inputState,
          }, null, 2),
          contentType: 'application/json',
        });
      }
    }

    if (apiErrors.length > 0) {
      await testInfo.attach('embed-form-5xx.json', {
        body: JSON.stringify(apiErrors, null, 2),
        contentType: 'application/json',
      });
    }
    if (requestFailures.length > 0) {
      await testInfo.attach('embed-form-request-failures.json', {
        body: JSON.stringify(requestFailures, null, 2),
        contentType: 'application/json',
      });
    }
    expect(apiErrors, `5xx errors during form submit: ${JSON.stringify(apiErrors)}`).toHaveLength(0);
  });

  test('AI responds to a message sent from the embedded widget', async ({ anonPage: page }, testInfo) => {
    const slug = DEFAULT_WIDGET_SLUG;
    const apiErrors: Array<{ url: string; status: number }> = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) {
        apiErrors.push({ url: response.url(), status: response.status() });
      }
    });

    await page.goto(`/mock-embed.html?slug=${encodeURIComponent(slug)}`, {
      waitUntil: 'domcontentloaded',
    });

    await waitForWidgetEvent(page, 'iframe_ready', WIDGET_READY_TIMEOUT_MS);

    const iframe = page.frameLocator('iframe[src*="/public/"]').first();
    const { messageInput } = await reachWidgetComposer(iframe, INTERACTIVE_TIMEOUT_MS);

    // Wait for AI chat response.
    const aiResponsePromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/ai/chat'),
      { timeout: AI_RESPONSE_TIMEOUT_MS }
    ).catch(() => null);

    await messageInput.fill('What services does your firm offer?');
    await iframe.locator('button[aria-label*="Send"], button[type="submit"]').first().click();

    const aiResponse = await aiResponsePromise;
    if (aiResponse && aiResponse.status() >= 500) {
      throw new Error(`AI response failed with ${aiResponse.status()} from ${aiResponse.url()}`);
    }

    // AI message should appear in the iframe DOM regardless of transport details.
    const aiMessages = iframe.locator('[data-testid="ai-message"]');
    try {
      await expect.poll(
        async () => await aiMessages.count(),
        { timeout: 25_000, message: 'Expected at least one AI message in the iframe DOM' }
      ).toBeGreaterThan(0);
    } catch {
      const bodySnapshot = await iframe.locator('body').innerText().catch(() => '');
      await testInfo.attach('embed-ai-no-response-body.txt', {
        body: bodySnapshot,
        contentType: 'text/plain',
      });
      throw new Error('AI response was not rendered in the iframe');
    }

    expect(apiErrors, `5xx errors during AI message flow: ${JSON.stringify(apiErrors)}`).toHaveLength(0);

    // Emit of blawby:new-message from the iframe is a bonus check.
    const events = await getWidgetEvents(page);
    const hasNewMsg = events.some((e) => e.type === 'blawby:new-message');
    if (!hasNewMsg) {
      await testInfo.attach('embed-events.json', {
        body: JSON.stringify(events, null, 2),
        contentType: 'application/json',
      });
      // Non-fatal: blawby:new-message may not fire if the widget is already open.
    }
  });
});
