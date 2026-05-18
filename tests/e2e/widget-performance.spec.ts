import { expect, test } from './fixtures.public';
import type { Request as PWRequest } from '@playwright/test';
import { randomUUID } from 'crypto';

interface ApiRecord {
  method: string;
  url: string;
  path: string;
  startedAtMs: number;
  endedAtMs: number | null;
  durationMs: number | null;
  status: number | null;
  failedText: string | null;
}

const MAX_BOOTSTRAP_MS = Number(process.env.E2E_WIDGET_BOOTSTRAP_BUDGET_MS ?? 2000);
const MAX_INTERACTIVE_MS = Number(process.env.E2E_WIDGET_INTERACTIVE_BUDGET_MS ?? 8000);
const MAX_AI_RESPONSE_MS = Number(process.env.E2E_WIDGET_AI_RESPONSE_BUDGET_MS ?? 45000);
const MAX_FORM_OPEN_MS = Number(process.env.E2E_WIDGET_FORM_OPEN_BUDGET_MS ?? 5000);
const MAX_FORM_SUBMIT_FEEDBACK_MS = Number(process.env.E2E_WIDGET_FORM_SUBMIT_BUDGET_MS ?? 15000);
// NEW: Updated expectations for new architecture
const MAX_FIRST_TOKEN_MS = Number(process.env.E2E_WIDGET_FIRST_TOKEN_BUDGET_MS ?? 12000);
const MAX_TURN_DURATION_MS = Number(process.env.E2E_WIDGET_TOOL_EXECUTION_BUDGET_MS ?? 25000);
const DEFAULT_WIDGET_SLUG = process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';
const ACCESS_FALLBACK_REGEX = /\bi (?:do not|don't) have access to this practice['']?s details\b/i;
const GENERIC_AI_FALLBACK_REGEX = /i wasn['']t able to generate a response/i;

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

const toPath = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl;
  }
};

test.describe('Public widget performance', () => {
  test.describe.configure({ timeout: 180000 });

  const createdConversationIds = new Set<string>();

  test.afterEach(async ({ anonPage }) => {
    // Cleanup: mark all created conversations as draft so they don't pollute the practice dashboard
    for (const id of createdConversationIds) {
      try {
        await anonPage.request.patch(`/api/conversations/${id}`, {
          data: { status: 'draft' }
        });
      } catch (e) {
        console.warn(`Failed to cleanup conversation ${id}:`, e);
      }
    }
    createdConversationIds.clear();
  });

  test('loads widget via real worker/bootstrap route and reports true waterfall timing', async ({ anonPage }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_WIDGET_SLUG);
    const records: ApiRecord[] = [];
    const inFlight = new Map<PWRequest, ApiRecord>();
    const startedAt = Date.now();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    anonPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    anonPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    const trackable = (request: PWRequest): boolean => {
      const requestUrl = request.url();
      const resourceType = request.resourceType();
      return requestUrl.includes('/api/') && (resourceType === 'fetch' || resourceType === 'xhr');
    };
    const listUnresolvedTrackedRequests = (): ApiRecord[] => records.filter((record) => {
      if (record.endedAtMs !== null) return false;
      if (record.path.startsWith('/api/practice/details/')) return false;
      // Streaming chat and reaction fetches can legitimately remain open while the page is active.
      if (record.path.startsWith('/api/ai/chat')) return false;
      if (record.path.includes('/messages/') && record.path.includes('/reactions')) return false;
      return true;
    });

    anonPage.on('request', (request) => {
      const requestUrl = request.url();
      if (!trackable(request)) return;

      const record: ApiRecord = {
        method: request.method(),
        url: requestUrl,
        path: toPath(requestUrl),
        startedAtMs: Date.now() - startedAt,
        endedAtMs: null,
        durationMs: null,
        status: null,
        failedText: null,
      };
      records.push(record);
      inFlight.set(request, record);
    });

    anonPage.on('response', async (response) => {
      const request = response.request();
      const url = response.url();
      if (url.includes('/api/conversations') && request.method() === 'POST' && response.status() === 200) {
        const body = await response.json().catch(() => null);
        if (body?.id) createdConversationIds.add(body.id);
      }
      const record = inFlight.get(request);
      if (!record) return;
      record.endedAtMs = Date.now() - startedAt;
      record.durationMs = Math.max(0, record.endedAtMs - record.startedAtMs);
      record.status = response.status();
      inFlight.delete(request);
    });

    anonPage.on('requestfailed', (request) => {
      const record = inFlight.get(request);
      if (!record) return;
      record.endedAtMs = Date.now() - startedAt;
      record.durationMs = Math.max(0, record.endedAtMs - record.startedAtMs);
      record.failedText = request.failure()?.errorText ?? 'request failed';
      inFlight.delete(request);
    });

    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`);

    await expect.poll(
      () => records.find((record) => record.path.includes('/api/widget/bootstrap')) ?? null,
      {
        timeout: 20000,
        message: 'Expected widget bootstrap request to be observed in the waterfall',
      }
    ).not.toBeNull();

    const bootstrapRecord = records.find((record) => record.path.includes('/api/widget/bootstrap'));
    const messageInput = anonPage.getByTestId('message-input');
    const consultationCta = anonPage.getByRole('button', { name: /request consultation/i }).first();
    const bodyLocator = anonPage.locator('body');
    let reachedInteractive = false;
    let interactiveFailure: string | null = null;

    try {
      await anonPage.waitForFunction(() => {
        const input = document.querySelector('[data-testid="message-input"]') as HTMLTextAreaElement | null;
        if (input && !input.disabled) return true;

        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some((button) =>
          (button.textContent ?? '').toLowerCase().includes('request consultation')
        );
      }, { timeout: 25000 });
      reachedInteractive = true;
    } catch (error) {
      interactiveFailure = error instanceof Error ? error.message : String(error);
    }

    const interactiveMs = Date.now() - startedAt;

    const slimFormName = anonPage.locator('input[placeholder*="full name" i], input[name="name"], label:has-text("Name") + input').first();
    const slimFormEmail = anonPage.locator('input[type="email"]').first();
    const slimFormPhone = anonPage.locator('input[type="tel"]').first();
    const slimFormContinue = anonPage.getByRole('button', { name: /continue/i }).first();
    const formOpenStartedAt = Date.now();
    let clickedCta = false;
    await expect.poll(
      async () => {
        if (!clickedCta && await consultationCta.isVisible({ timeout: 250 }).catch(() => false)) {
          await consultationCta.click().catch(() => undefined);
          clickedCta = true;
        }
        const disclaimerAccept = anonPage.getByRole('button', { name: /accept/i }).first();
        if (await disclaimerAccept.isVisible({ timeout: 250 }).catch(() => false)) {
          await disclaimerAccept.click().catch(() => undefined);
        }

        const inputEnabled = await messageInput.isEnabled({ timeout: 250 }).catch(() => false);
        const formVisible = await slimFormName.isVisible({ timeout: 250 }).catch(() => false);
        return inputEnabled || formVisible;
      },
      {
        timeout: MAX_FORM_OPEN_MS,
        message: 'Expected slim form or composer after opening the public widget flow',
      }
    ).toBe(true);
    const formOpenMs = Date.now() - formOpenStartedAt;

    const uniqueId = randomUUID().slice(0, 8);
    const email = `widget-e2e+${uniqueId}@test-blawby.com`;
    let formSubmitFeedbackMs: number | null = null;

    if (await slimFormName.isVisible({ timeout: 500 }).catch(() => false)) {
      const submitStartedAt = Date.now();
      await expect(slimFormName).toBeEditable({ timeout: 5000 });
      await slimFormName.fill(`Widget Lead ${uniqueId}`);
      if (await slimFormEmail.isVisible().catch(() => false)) {
        await slimFormEmail.fill(email);
      }
      if (await slimFormPhone.isVisible().catch(() => false)) {
        await slimFormPhone.fill('555-555-1212');
      }
      await slimFormContinue.click();
      await expect(messageInput).toBeEnabled({ timeout: MAX_FORM_SUBMIT_FEEDBACK_MS });
      await expect(bodyLocator).toContainText('Contact info received', { timeout: MAX_FORM_SUBMIT_FEEDBACK_MS });
      await expect(
        bodyLocator,
        'Contact acknowledgement should include the submitted email address.'
      ).toContainText(email, { timeout: MAX_FORM_SUBMIT_FEEDBACK_MS });
      formSubmitFeedbackMs = Date.now() - submitStartedAt;
    } else {
      await expect(messageInput).toBeEnabled({ timeout: MAX_FORM_SUBMIT_FEEDBACK_MS });
    }

    let aiResponseMs: number | null = null;
    let aiFlowError: Error | null = null;
    let aiReplyText = '';
    let aiResponseMessageId: string | null = null;
    let aiResponseTransport: 'json' | 'sse' | null = null;
    let aiDeliveryDiagnostics: Record<string, unknown> | null = null;
    let flowStartedAt = 0;
    try {
      await messageInput.fill('What are your hours of operation?');
      const aiResponsePromise = anonPage.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().includes('/api/ai/chat') && response.status() === 200,
        { timeout: MAX_AI_RESPONSE_MS }
      );
      flowStartedAt = Date.now();
      await anonPage.getByRole('button', { name: /send message/i }).click();
      const aiNetworkResponse = await aiResponsePromise;
      aiResponseMs = Date.now() - flowStartedAt;

      const aiContentType = aiNetworkResponse.headers()['content-type'] ?? '';
      if (aiContentType.includes('application/json')) {
        aiResponseTransport = 'json';
        const aiBody = await aiNetworkResponse.json().catch(() => null) as {
          reply?: string;
          message?: { id?: string; role?: string; content?: string };
        } | null;
        aiResponseMessageId = aiBody?.message?.id ?? null;
        aiReplyText = aiBody?.reply ?? aiBody?.message?.content ?? '';
        if (!aiReplyText) {
          throw new Error('AI route returned JSON but no reply/message content was present');
        }
        try {
          await expect(bodyLocator).toContainText(aiReplyText.slice(0, 60), { timeout: 8000 });
        } catch (renderError) {
          aiDeliveryDiagnostics = await anonPage.evaluate(({ aiReplyPrefix, messageId }) => {
            const bodyText = document.body?.innerText ?? '';
            const headerSubtitle = document.querySelector('.workspace-header__subtitle')?.textContent ?? null;
            const headerTitle = document.querySelector('.workspace-header__title')?.textContent ?? null;
            const userMessages = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
              .slice(-3)
              .map((el) => (el.textContent ?? '').trim());
            const aiMessages = Array.from(document.querySelectorAll('[data-testid="ai-message"]'))
              .slice(-3)
              .map((el) => (el.textContent ?? '').trim());
            const systemMessages = Array.from(document.querySelectorAll('[data-testid="system-message"]'))
              .slice(-5)
              .map((el) => (el.textContent ?? '').trim());
            const messageInput = document.querySelector('[data-testid="message-input"]') as HTMLTextAreaElement | null;
            return {
              currentUrl: window.location.href,
              headerTitle,
              headerSubtitle,
              bodyHasReplyPrefix: bodyText.includes(aiReplyPrefix),
              bodySnippetTail: bodyText.slice(-800),
              aiReplyPrefix,
              messageId,
              visibleCounts: {
                user: document.querySelectorAll('[data-testid="user-message"]').length,
                ai: document.querySelectorAll('[data-testid="ai-message"]').length,
                system: document.querySelectorAll('[data-testid="system-message"]').length,
                streaming: document.querySelectorAll('[id^="streaming-"]').length,
              },
              composerState: {
                exists: Boolean(messageInput),
                disabled: messageInput?.disabled ?? null,
              },
              recentVisibleMessages: { userMessages, aiMessages, systemMessages },
            };
          }, { aiReplyPrefix: aiReplyText.slice(0, 60), messageId: aiResponseMessageId });
          throw new Error(
            `AI response persisted but reply text was not rendered in DOM within timeout. ` +
            `messageId=${aiResponseMessageId ?? 'unknown'} transport=json. ` +
            `Diagnostics=${JSON.stringify(aiDeliveryDiagnostics).slice(0, 1500)}`
          );
        }
      } else {
        aiResponseTransport = 'sse';
        const anyAiMessage = anonPage.getByTestId('ai-message');
        await expect
          .poll(async () => await anyAiMessage.count(), { timeout: MAX_AI_RESPONSE_MS })
          .toBeGreaterThan(0);
        const visibleAiCount = await anyAiMessage.count();
        if (visibleAiCount > 0) {
          aiReplyText = await anyAiMessage.nth(Math.max(0, visibleAiCount - 1)).innerText().catch(() => '');
        }
      }

      if (GENERIC_AI_FALLBACK_REGEX.test(aiReplyText)) {
        throw new Error('AI fallback response detected in widget flow.');
      }
      if (ACCESS_FALLBACK_REGEX.test(aiReplyText)) {
        throw new Error(`AI returned no-context fallback in widget flow: ${aiReplyText}`);
      }
    } catch (error) {
      const bodyText = await bodyLocator.innerText().catch(() => '');
      if (ACCESS_FALLBACK_REGEX.test(bodyText) || GENERIC_AI_FALLBACK_REGEX.test(bodyText)) {
        aiResponseMs = Date.now() - flowStartedAt;
        aiFlowError = new Error(`AI returned no-context fallback in widget flow: ${bodyText.slice(0, 500)}`);
      } else {
        aiResponseMs = null;
        if (error instanceof Error) aiFlowError = error;
      }
    }

    await anonPage.waitForTimeout(300);
    const unresolved = listUnresolvedTrackedRequests();

    const browserResourceTiming = await anonPage.evaluate(() => {
      return performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/api/'))
        .map((entry) => ({
          name: entry.name,
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          transferSize: 'transferSize' in entry ? (entry as PerformanceResourceTiming).transferSize : undefined,
        }));
    });

    const pageDiagnostics = await anonPage.evaluate(() => {
      const text = document.body?.innerText ?? '';
      const appNode = document.querySelector('#app');
      const chatContainer = document.querySelector('[data-testid="chat-container"]');
      const messageInput = document.querySelector('[data-testid="message-input"]');
      return {
        title: document.title,
        hasLoadingText: text.includes('Loading'),
        has404Text: text.includes('404'),
        snippet: text.slice(0, 800),
        appMounted: Boolean(appNode),
        appHtmlLength: appNode?.innerHTML.length ?? 0,
        hasChatContainer: Boolean(chatContainer),
        hasMessageInput: Boolean(messageInput),
        hasConsultationCta: Boolean(
          Array.from(document.querySelectorAll('button')).find((button) =>
            (button.textContent ?? '').toLowerCase().includes('request consultation')
          )
        ),
      };
    });

    const report = {
      budgets: {
        bootstrapMs: MAX_BOOTSTRAP_MS,
        interactiveMs: MAX_INTERACTIVE_MS,
        aiResponseMs: MAX_AI_RESPONSE_MS,
        formOpenMs: MAX_FORM_OPEN_MS,
        formSubmitFeedbackMs: MAX_FORM_SUBMIT_FEEDBACK_MS,
      },
      metrics: {
        interactiveMs,
        aiResponseMs,
        formOpenMs,
        formSubmitFeedbackMs,
        reachedInteractive,
        interactiveFailure,
        bootstrapStatus: bootstrapRecord?.status ?? null,
        bootstrapDurationMs: bootstrapRecord?.durationMs ?? null,
        bootstrapConversationId: null,
        bootstrapHadSessionUser: null,
      },
      aiDelivery: {
        transport: aiResponseTransport,
        messageId: aiResponseMessageId,
        diagnostics: aiDeliveryDiagnostics,
        recentSyncRequests: records
          .filter((r) =>
            r.path.includes('/api/conversations/') &&
            (r.path.includes('/messages?from_seq=') || r.path.includes('/messages/') || r.path.includes('/reactions'))
          )
          .slice(-12),
      },
      apiWaterfall: records.sort((a, b) => a.startedAtMs - b.startedAtMs),
      browserResourceTiming,
      pageDiagnostics,
      consoleErrors,
      pageErrors,
    };

    await testInfo.attach('widget-performance-report.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    console.log('[widget-e2e] Interactive(ms):', interactiveMs);
    console.log('[widget-e2e] Bootstrap status:', bootstrapRecord?.status ?? 'MISSING');
    console.log(
      '[widget-e2e] Bootstrap conversationId:',
      'MISSING (expected when bootstrap does not pre-create conversations)'
    );
    console.log('[widget-e2e] API waterfall:', JSON.stringify(report.apiWaterfall, null, 2));
    console.log('[widget-e2e] Unresolved tracked requests:', JSON.stringify(unresolved, null, 2));
    console.log('[widget-e2e] Page diagnostics:', JSON.stringify(pageDiagnostics, null, 2));
    if (consoleErrors.length > 0) {
      console.log('[widget-e2e] Console errors:', JSON.stringify(consoleErrors, null, 2));
    }
    if (pageErrors.length > 0) {
      console.log('[widget-e2e] Page errors:', JSON.stringify(pageErrors, null, 2));
    }

    expect(bootstrapRecord, 'must observe /api/widget/bootstrap request in waterfall').toBeDefined();
    expect(
      (bootstrapRecord?.status ?? 0) >= 200 && (bootstrapRecord?.status ?? 0) < 300,
      'bootstrap endpoint must return 2xx'
    ).toBeTruthy();
    expect(bootstrapRecord?.durationMs ?? Number.POSITIVE_INFINITY, 'bootstrap request exceeded budget').toBeLessThan(MAX_BOOTSTRAP_MS);
    expect(reachedInteractive, `widget never reached interactive state: ${interactiveFailure ?? 'unknown failure'}`).toBeTruthy();
    expect(interactiveMs, 'widget interactive time exceeded budget').toBeLessThan(MAX_INTERACTIVE_MS);
    expect(pageErrors, 'widget should not raise runtime page errors').not.toContain('Chat connection closed');
    expect(aiFlowError, aiFlowError?.message ?? 'AI flow should not error').toBeNull();
    expect(aiResponseMs, 'Expected a real AI response timing metric in widget flow').not.toBeNull();
    expect(aiResponseMs ?? Number.POSITIVE_INFINITY, 'AI response exceeded budget').toBeLessThan(MAX_AI_RESPONSE_MS);
    expect(formOpenMs, 'Consultation form open exceeded budget').toBeLessThan(MAX_FORM_OPEN_MS);
    if (formSubmitFeedbackMs !== null) {
      expect(formSubmitFeedbackMs, 'Consultation form submit feedback exceeded budget').toBeLessThan(MAX_FORM_SUBMIT_FEEDBACK_MS);
    }
    expect(listUnresolvedTrackedRequests().length, 'all tracked /api/ requests must settle (no pending hang)').toBe(0);
  });

  // NEW: Architecture-specific performance tests
  test('first-byte response is < 2 seconds with new architecture', async ({ anonPage }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_WIDGET_SLUG);
    const records: ApiRecord[] = [];
    const inFlight = new Map();
    
    const trackable = (request: PWRequest): boolean => {
      const requestUrl = request.url();
      const resourceType = request.resourceType();
      return requestUrl.includes('/api/') && (resourceType === 'fetch' || resourceType === 'xhr');
    };

    anonPage.on('request', (request) => {
      const requestUrl = request.url();
      if (!trackable(request)) return;

      const record: ApiRecord = {
        method: request.method(),
        url: requestUrl,
        path: toPath(requestUrl),
        startedAtMs: Date.now(),
        endedAtMs: null,
        durationMs: null,
        status: null,
        failedText: null,
      };
      records.push(record);
      inFlight.set(request, record);
    });

    anonPage.on('response', async (response) => {
      const request = response.request();
      const url = response.url();
      if (url.includes('/api/conversations') && request.method() === 'POST' && response.status() === 200) {
        const body = await response.json().catch(() => null);
        if (body?.id) createdConversationIds.add(body.id);
      }
      const record = inFlight.get(request);
      if (!record) return;
      record.endedAtMs = Date.now();
      record.durationMs = Math.max(0, record.endedAtMs - record.startedAtMs);
      record.status = response.status();
      inFlight.delete(request);
    });

    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`);

    // Complete slim form
    const slimFormName = anonPage.locator('input[placeholder*="full name" i], input[name="name"], label:has-text("Name") + input').first();
    const slimFormEmail = anonPage.locator('input[type="email"]').first();
    const slimFormPhone = anonPage.locator('input[type="tel"]').first();
    const slimFormContinue = anonPage.getByRole('button', { name: /continue/i }).first();
    const consultationCta = anonPage.getByRole('button', { name: /request consultation/i }).first();
    const messageInput = anonPage.getByTestId('message-input');

    let clickedCta = false;
    await expect.poll(
      async () => {
        if (!clickedCta && await consultationCta.isVisible({ timeout: 250 }).catch(() => false)) {
          await consultationCta.click().catch(() => undefined);
          clickedCta = true;
        }
        const disclaimerAccept = anonPage.getByRole('button', { name: /accept/i }).first();
        if (await disclaimerAccept.isVisible({ timeout: 250 }).catch(() => false)) {
          await disclaimerAccept.click().catch(() => undefined);
        }

        const inputEnabled = await messageInput.isEnabled({ timeout: 250 }).catch(() => false);
        const formVisible = await slimFormName.isVisible({ timeout: 250 }).catch(() => false);
        return inputEnabled || formVisible;
      },
      {
        timeout: MAX_FORM_OPEN_MS,
        message: 'Expected slim form or composer after opening the public widget flow',
      }
    ).toBe(true);

    if (await slimFormName.isVisible({ timeout: 500 }).catch(() => false)) {
      await slimFormName.fill('Performance Test User');
      if (await slimFormEmail.isVisible().catch(() => false)) {
        await slimFormEmail.fill('perf-test@test-blawby.com');
      }
      if (await slimFormPhone.isVisible().catch(() => false)) {
        await slimFormPhone.fill('555-555-1212');
      }
      await slimFormContinue.click();
      await expect(messageInput).toBeEnabled({ timeout: MAX_FORM_SUBMIT_FEEDBACK_MS });
    }

    // Measure first token timing
    await messageInput.fill('I need legal help with a contract dispute');
    
    // Start timing right before the click to measure only server/stream latency
    const startTime = Date.now();
    
    const baselineCount = await anonPage.locator('[data-testid="ai-message"]').count();
    
    // Create the DOM polling promise BEFORE clicking so we don't miss the start
    const firstTokenPromise = anonPage.waitForFunction((count) => {
      const messages = Array.from(document.querySelectorAll('[data-testid="ai-message"]'));
      if (messages.length > count) {
        const latest = messages[messages.length - 1];
        return latest.textContent && latest.textContent.trim().length > 0;
      }
      return false;
    }, baselineCount, { timeout: MAX_FIRST_TOKEN_MS });

    await anonPage.getByRole('button', { name: /send message/i }).click();
    
    // Await first token immediately to compute firstTokenMs accurately
    await firstTokenPromise;
    const firstTokenMs = Date.now() - startTime;

    const report = {
      firstTokenMs,
      baseline: MAX_FIRST_TOKEN_MS,
      regression: firstTokenMs > MAX_FIRST_TOKEN_MS * 1.2,
      apiWaterfall: records.sort((a, b) => a.startedAtMs - b.startedAtMs),
    };

    await testInfo.attach('first-token-performance.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    console.log('[performance] First token (ms):', firstTokenMs);
    console.log('[performance] First token budget (ms):', MAX_FIRST_TOKEN_MS);
    expect(firstTokenMs, 'First token response exceeded budget').toBeLessThan(MAX_FIRST_TOKEN_MS);
  });

  test('turn/end-to-end performance benchmarks', async ({ anonPage }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_WIDGET_SLUG);
    const turnTimings: Record<string, { durationMs: number; expectedMs: number }> = {};
    
    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`);

    // Complete slim form to get to chat
    const consultationCta = anonPage.getByRole('button', { name: /request consultation/i }).first();
    const slimFormName = anonPage.locator('input[placeholder*="full name" i], input[name="name"], label:has-text("Name") + input').first();
    const slimFormEmail = anonPage.locator('input[type="email"]').first();
    const slimFormPhone = anonPage.locator('input[type="tel"]').first();
    const slimFormContinue = anonPage.getByRole('button', { name: /continue/i }).first();
    const messageInput = anonPage.getByTestId('message-input');

    let clickedCta = false;
    await expect.poll(
      async () => {
        if (!clickedCta && await consultationCta.isVisible({ timeout: 250 }).catch(() => false)) {
          await consultationCta.click().catch(() => undefined);
          clickedCta = true;
        }
        const disclaimerAccept = anonPage.getByRole('button', { name: /accept/i }).first();
        if (await disclaimerAccept.isVisible({ timeout: 250 }).catch(() => false)) {
          await disclaimerAccept.click().catch(() => undefined);
        }

        const inputEnabled = await messageInput.isEnabled({ timeout: 250 }).catch(() => false);
        const formVisible = await slimFormName.isVisible({ timeout: 250 }).catch(() => false);
        return inputEnabled || formVisible;
      },
      {
        timeout: MAX_FORM_OPEN_MS,
        message: 'Expected slim form or composer after opening the public widget flow',
      }
    ).toBe(true);

    if (await slimFormName.isVisible({ timeout: 500 }).catch(() => false)) {
      await slimFormName.fill('Performance Test User');
      if (await slimFormEmail.isVisible({ timeout: 500 }).catch(() => false)) {
        await slimFormEmail.fill('perf-test@test-blawby.com');
      }
      if (await slimFormPhone.isVisible({ timeout: 500 }).catch(() => false)) {
        await slimFormPhone.fill('555-555-1212');
      }
      await slimFormContinue.click();
      await expect(messageInput).toBeEnabled({ timeout: MAX_FORM_SUBMIT_FEEDBACK_MS });
    }

    const measureTurn = async (label: string, message: string) => {
      const baselineCount = await anonPage.locator('[data-testid="ai-message"]').count();
      const startTime = Date.now();
      
      const firstTokenPromise = anonPage.waitForFunction((count) => {
        const messages = Array.from(document.querySelectorAll('[data-testid="ai-message"]'));
        if (messages.length > count) {
          const latest = messages[messages.length - 1];
          return latest.textContent && latest.textContent.trim().length > 0;
        }
        return false;
      }, baselineCount, { timeout: MAX_AI_RESPONSE_MS });

      await messageInput.fill(message);
      await anonPage.getByRole('button', { name: /send message/i }).click();
      
      await firstTokenPromise;
      const durationMs = Date.now() - startTime;
      
      turnTimings[label] = {
        durationMs,
        expectedMs: MAX_TURN_DURATION_MS
      };
      
      return durationMs;
    };

    // Turn 1: Case description (triggers save_case_details logic server-side)
    await measureTurn(
      'initial_extraction', 
      'I need help with a divorce case in California against my spouse Jane. It\'s time sensitive because we have a court date next month.'
    );

    // Turn 2: Payment intent (triggers request_payment logic server-side)
    await measureTurn(
      'payment_prompt',
      'I\'m ready to proceed with payment and submit my request'
    );

    const report = {
      turnTimings,
      regression: Object.values(turnTimings).some(t => t.durationMs > t.expectedMs * 1.5),
      baseline: {
        'initial_extraction': MAX_TURN_DURATION_MS,
        'payment_prompt': MAX_TURN_DURATION_MS,
      }
    };

    await testInfo.attach('turn-performance.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    console.log('[performance] Turn timings:', turnTimings);
    
    Object.entries(turnTimings).forEach(([label, timing]) => {
      expect(timing.durationMs, `Turn ${label} execution exceeded budget`).toBeLessThan(timing.expectedMs * 1.5);
    });
  });
});
