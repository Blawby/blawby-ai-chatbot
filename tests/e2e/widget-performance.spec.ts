import { expect, test } from './fixtures';
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

const MAX_BOOTSTRAP_MS = Number(process.env.E2E_WIDGET_BOOTSTRAP_BUDGET_MS ?? 6000);
const MAX_INTERACTIVE_MS = Number(process.env.E2E_WIDGET_INTERACTIVE_BUDGET_MS ?? 10000);
const MAX_AI_RESPONSE_MS = Number(process.env.E2E_WIDGET_AI_RESPONSE_BUDGET_MS ?? 30000);
const MAX_FORM_OPEN_MS = Number(process.env.E2E_WIDGET_FORM_OPEN_BUDGET_MS ?? 15000);
const MAX_FORM_SUBMIT_FEEDBACK_MS = Number(process.env.E2E_WIDGET_FORM_SUBMIT_BUDGET_MS ?? 15000);
const DEFAULT_WIDGET_SLUG = process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';
const ACCESS_FALLBACK_REGEX = /\bi (?:do not|don't) have access\b/i;
const HOURS_NO_CONTEXT_FALLBACK_REGEX = /\bi (?:do not|don't) have specific hours\b|\bi can(?:not|'t) provide specific hours\b/i;

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

test.describe('Widget performance (real e2e)', () => {
  test.describe.configure({ timeout: 120000 });

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

    anonPage.on('response', (response) => {
      const request = response.request();
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

    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`, {
      waitUntil: 'domcontentloaded',
    });

    const bootstrapResponse = await anonPage.waitForResponse(
      (response) => response.request().method() === 'GET' && response.url().includes('/api/widget/bootstrap'),
      { timeout: 20000 }
    );

    const bootstrapRecord = records.find((record) => record.path.includes('/api/widget/bootstrap'));
    const messageInput = anonPage.getByTestId('message-input');
    const consultationCta = anonPage.getByRole('button', { name: /request consultation/i }).first();
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

    const flowStartedAt = Date.now();
    const slimFormName = anonPage.getByLabel('Name');
    const slimFormEmail = anonPage.getByLabel('Email');
    const slimFormPhone = anonPage.getByLabel('Phone');
    const slimFormContinue = anonPage.getByRole('button', { name: /continue/i }).first();
    const formOpenStartedAt = Date.now();
    await consultationCta.click();
    await expect(slimFormName).toBeVisible({ timeout: MAX_FORM_OPEN_MS });
    await anonPage.waitForTimeout(750);
    await expect(slimFormName).toBeVisible({ timeout: 2000 });
    const formOpenMs = Date.now() - formOpenStartedAt;

    const uniqueId = randomUUID().slice(0, 8);
    const email = `widget-e2e+${uniqueId}@example.com`;
    const submitStartedAt = Date.now();

    await expect(slimFormName).toBeEditable({ timeout: 5000 });
    await slimFormName.fill(`Widget Lead ${uniqueId}`);
    await slimFormEmail.fill(email);
    await slimFormPhone.fill('555-555-1212');
    await slimFormContinue.click();

    await expect(messageInput).toBeEnabled({ timeout: MAX_FORM_SUBMIT_FEEDBACK_MS });
    const formSubmitFeedbackMs = Date.now() - submitStartedAt;

    let aiResponseMs: number | null = null;
    let aiFlowError: Error | null = null;
    const aiMessages = anonPage.getByTestId('ai-message');
    const bodyLocator = anonPage.locator('body');
    try {
      const initialAiCount = await aiMessages.count();
      await messageInput.fill('What are your hours of operation?');
      await anonPage.getByRole('button', { name: /send message/i }).click();
      await expect
        .poll(async () => await aiMessages.count(), { timeout: MAX_AI_RESPONSE_MS })
        .toBeGreaterThan(initialAiCount);
      aiResponseMs = Date.now() - flowStartedAt;
      const latestAiCount = await aiMessages.count();
      const latestAiText = await aiMessages.nth(Math.max(0, latestAiCount - 1)).innerText();
      if (latestAiText.includes('I wasn\'t able to generate a response')) {
        throw new Error('AI fallback response detected in widget flow.');
      }
      if (ACCESS_FALLBACK_REGEX.test(latestAiText) || HOURS_NO_CONTEXT_FALLBACK_REGEX.test(latestAiText)) {
        throw new Error(`AI returned no-context fallback in widget flow: ${latestAiText}`);
      }
    } catch (error) {
      const bodyText = await bodyLocator.innerText().catch(() => '');
      if (ACCESS_FALLBACK_REGEX.test(bodyText) || HOURS_NO_CONTEXT_FALLBACK_REGEX.test(bodyText)) {
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
        bootstrapStatus: bootstrapResponse.status(),
        bootstrapDurationMs: bootstrapRecord?.durationMs ?? null,
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
    console.log('[widget-e2e] Bootstrap status:', bootstrapResponse.status());
    console.log('[widget-e2e] API waterfall:', JSON.stringify(report.apiWaterfall, null, 2));
    console.log('[widget-e2e] Unresolved tracked requests:', JSON.stringify(unresolved, null, 2));
    console.log('[widget-e2e] Page diagnostics:', JSON.stringify(pageDiagnostics, null, 2));
    if (consoleErrors.length > 0) {
      console.log('[widget-e2e] Console errors:', JSON.stringify(consoleErrors, null, 2));
    }
    if (pageErrors.length > 0) {
      console.log('[widget-e2e] Page errors:', JSON.stringify(pageErrors, null, 2));
    }

    expect(bootstrapResponse.ok(), 'bootstrap endpoint must return 2xx').toBeTruthy();
    expect(bootstrapRecord, 'must observe /api/widget/bootstrap request in waterfall').toBeDefined();
    expect(bootstrapRecord?.durationMs ?? Number.POSITIVE_INFINITY, 'bootstrap request exceeded budget').toBeLessThan(MAX_BOOTSTRAP_MS);
    expect(reachedInteractive, `widget never reached interactive state: ${interactiveFailure ?? 'unknown failure'}`).toBeTruthy();
    expect(interactiveMs, 'widget interactive time exceeded budget').toBeLessThan(MAX_INTERACTIVE_MS);
    expect(pageErrors, 'widget should not raise runtime page errors').not.toContain('Chat connection closed');
    expect(aiFlowError, aiFlowError?.message ?? 'AI flow should not error').toBeNull();
    expect(aiResponseMs, 'Expected a real AI response timing metric in widget flow').not.toBeNull();
    expect(aiResponseMs ?? Number.POSITIVE_INFINITY, 'AI response exceeded budget').toBeLessThan(MAX_AI_RESPONSE_MS);
    expect(formOpenMs, 'Consultation form open exceeded budget').toBeLessThan(MAX_FORM_OPEN_MS);
    expect(formSubmitFeedbackMs, 'Consultation form submit feedback exceeded budget').toBeLessThan(MAX_FORM_SUBMIT_FEEDBACK_MS);
    expect(listUnresolvedTrackedRequests().length, 'all tracked /api/ requests must settle (no pending hang)').toBe(0);
  });
});
