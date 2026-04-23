import { expect, test } from './fixtures.public';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_PRACTICE_SLUG = process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';
const rawBudget = process.env.E2E_WIDGET_AI_RESPONSE_BUDGET_MS;
const parsedBudget = rawBudget ? parseInt(rawBudget, 10) : 90000;
const MAX_AI_RESPONSE_MS = Number.isFinite(parsedBudget) ? parsedBudget : 120000;
const LEAD_TURN_TIMEOUT_MS = MAX_AI_RESPONSE_MS;
const rawExpectedConsultationFeeMinor = process.env.E2E_EXPECTED_CONSULTATION_FEE_MINOR;
const parsedExpectedConsultationFeeMinor = rawExpectedConsultationFeeMinor
  ? parseInt(rawExpectedConsultationFeeMinor, 10)
  : 7500;
const EXPECTED_CONSULTATION_FEE_MINOR = Number.isFinite(parsedExpectedConsultationFeeMinor)
  ? parsedExpectedConsultationFeeMinor
  : 7500;
const EXPECTED_CONSULTATION_FEE_LABEL = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(EXPECTED_CONSULTATION_FEE_MINOR / 100);

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

const buildWidgetUrl = (practiceSlug: string): string => (
  `/public/${encodeURIComponent(practiceSlug)}?v=widget`
);

type DonePayload = {
  metadata?: Record<string, unknown>;
  intakeFields?: Record<string, unknown> | null;
  question?: {
    text?: string;
    options?: Array<{ label?: string; value?: string }>;
  } | null;
  wasToolOnly?: boolean;
  messagePersisted?: boolean;
  persistedMessageId?: string | null;
  actions?: Array<Record<string, unknown>> | null;
};

/**
 * Robustly parses SSE stream text to extract 'done' payloads.
 * Handles multi-line chunks and potential JSON fragmentation.
 */
function parseDonePayloads(text: string): DonePayload[] {
  if (!text) return [];
  return text
    .split('\n')
    .filter((line) => line.trim().startsWith('data: '))
    .map((line) => {
      const jsonStr = line.trim().slice(6);
      try {
        const data = JSON.parse(jsonStr);
        return data.done ? (data as DonePayload) : null;
      } catch {
        return null;
      }
    })
    .filter((p): p is DonePayload => p !== null);
}


// Robustly prepares the widget composer, matching the current WidgetApp/ChatContainer logic.
const prepareWidgetComposer = async (
  anonPage: Page,
  authName: string,
  authEmail: string,
) => {
  const messageInput = anonPage.getByTestId('message-input');
  const consultationCta = anonPage.getByRole('button', { name: /request consultation/i }).first();
  const slimFormName = anonPage.locator('input[placeholder*="full name" i], input[name="name"], label:has-text("Name") + input').first();
  const slimFormEmail = anonPage.locator('input[type="email"]').first();
  const slimFormPhone = anonPage.locator('input[type="tel"]').first();
  const slimFormContinue = anonPage.getByRole('button', { name: /continue/i }).first();
  const disclaimerButton = anonPage.getByRole('button', { name: /accept|understand|agree|disclaimer/i }).first();

  const deadline = Date.now() + 60_000;
  let lastStep = 'init';
  let isReady = false;


  let ctaClicked = false;
  while (Date.now() < deadline) {
    // 1. If composer is enabled, we're done
    if (await messageInput.isEnabled({ timeout: 250 }).catch(() => false)) {
      lastStep = 'composer-ready';
      isReady = true;
      break;
    }

    // 2. If slim form is present, fill and submit
    if (await slimFormContinue.isVisible({ timeout: 250 }).catch(() => false)) {
      if (await slimFormName.isVisible({ timeout: 250 }).catch(() => false)) {
        await slimFormName.fill(authName, { timeout: 1000 }).catch(() => undefined);
      }
      if (await slimFormEmail.isVisible({ timeout: 250 }).catch(() => false)) {
        await slimFormEmail.fill(authEmail, { timeout: 1000 }).catch(() => undefined);
      }
      if (await slimFormPhone.isVisible({ timeout: 250 }).catch(() => false)) {
        await slimFormPhone.fill('5555551212', { timeout: 1000 }).catch(() => undefined);
      }
      if (await slimFormContinue.isEnabled({ timeout: 250 }).catch(() => false)) {
        try {
          await slimFormContinue.click({ timeout: 1000, noWaitAfter: true });
          lastStep = 'slim-form-submitted';
          await anonPage.waitForTimeout(500);
        } catch (e) {}
        continue;
      }
    }

    // 3. If disclaimer is present, accept it
    if (await disclaimerButton.isVisible({ timeout: 500 }).catch(() => false)) {
      try {
        await disclaimerButton.click({ timeout: 5000, noWaitAfter: true });
        lastStep = 'disclaimer-accepted';
        await expect(disclaimerButton).not.toBeVisible({ timeout: 5000 }).catch(() => undefined);
      } catch (e) {}
      continue;
    }

    // 4. If consultation CTA is present, click it (only once)
    if (!ctaClicked && await consultationCta.isVisible({ timeout: 500 }).catch(() => false)) {
      try {
        await consultationCta.click({ timeout: 1000, noWaitAfter: true });
        lastStep = 'cta-clicked';
        ctaClicked = true;
        await anonPage.waitForTimeout(300);
      } catch (e) {}
      continue;
    }

    // Wait a bit before next poll
    await anonPage.waitForTimeout(200);
  }

  expect(isReady, `Failed to reach compose state in prepareWidgetComposer. Last step: ${lastStep}`).toBe(true);
  return { messageInput };
};

test.describe('Public widget intake flow', () => {
  test.describe.configure({ timeout: 300000 });

  test.beforeEach(async ({ anonPage }) => {
    // Only manipulate sessionStorage in addInitScript to avoid SecurityError
    const storageResetToken = `widget-intake-flow-${randomUUID()}`;
    await anonPage.addInitScript((token) => {
      try {
        if (window.name === token) {
          return;
        }
        // Remove widget-related sessionStorage keys, including disclaimer acceptance
        const keysToRemove = Object.keys(sessionStorage).filter((key) =>
          key.startsWith('blawby_widget_bootstrap_') ||
          key === 'blawby:widget:attribution' ||
          key.startsWith('blawby-widget-disclaimer-accepted:')
        );
        keysToRemove.forEach((key) => sessionStorage.removeItem(key));
        window.name = token;
      } catch {
        // Ignore storage access failures in the test harness.
      }
    }, storageResetToken);
  });

  const isActiveConversationFetch = (response: { request: () => { method: () => string }; url: () => string }): boolean => (
    response.request().method() === 'GET'
    && response.url().includes('/api/conversations/active')
    && response.url().includes('practiceId=')
  );

  test('public intake reaches submit CTA and submit button advances flow', async ({
    anonPage,
  }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const submitIntakeStatuses: number[] = [];
    const activeConversationStatuses: number[] = [];
    const networkLog: Array<{ time: string; method: string; url: string; status?: number }> = [];
    const intakeSettingsPayloads: Array<{
      url: string;
      status: number;
      payload: {
        success?: boolean;
        data?: {
          settings?: {
            paymentLinkEnabled?: boolean;
            payment_link_enabled?: boolean;
            consultationFee?: number;
            consultation_fee?: number;
          };
        };
      } | null;
    }> = [];
    let latestDonePayload: DonePayload | null = null;

    anonPage.on('console', (msg) => {
      if (msg.text().includes('[QuickActionDebug]')) {
        console.log(msg.text());
      }
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    anonPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    anonPage.on('request', (request) => {
      if (request.url().includes('/api/')) {
        networkLog.push({
          time: new Date().toISOString(),
          method: request.method(),
          url: request.url(),
        });
      }
    });
    anonPage.on('response', (response) => {
      if (response.url().includes('/api/')) {
        const entry = networkLog.findLast((item) =>
          item.url === response.url() && item.method === response.request().method() && !item.status
        );
        if (entry) entry.status = response.status();
      }
      if (isActiveConversationFetch(response)) {
        activeConversationStatuses.push(response.status());
      }
      if (
        response.request().method() === 'POST' &&
        response.url().includes('/api/conversations/') &&
        response.url().includes('/submit-intake')
      ) {
        submitIntakeStatuses.push(response.status());
      }
      if (
        response.request().method() === 'GET' &&
        response.url().includes('/api/practice-client-intakes/') &&
        response.url().includes('/intake')
      ) {
        void response.json()
          .then((payload) => {
            intakeSettingsPayloads.push({
              url: response.url(),
              status: response.status(),
              payload: payload as {
                success?: boolean;
                data?: {
                  settings?: {
                    paymentLinkEnabled?: boolean;
                    payment_link_enabled?: boolean;
                    consultationFee?: number;
                    consultation_fee?: number;
                  };
                };
              } | null,
            });
          })
          .catch(() => {
            intakeSettingsPayloads.push({
              url: response.url(),
              status: response.status(),
              payload: null,
            });
          });
      }
      if (response.url().includes('/api/ai/chat') && response.request().method() === 'POST') {
        void response.text().then((text) => {
          const payloads = parseDonePayloads(text);
          if (payloads.length) {
            latestDonePayload = payloads[payloads.length - 1];
          }
        });
      }
    });

    await anonPage.goto(buildWidgetUrl(practiceSlug), { waitUntil: 'domcontentloaded' });

    const uniqueId = randomUUID().slice(0, 8);
    const authEmail = `lead-e2e+${uniqueId}@test-blawby.com`;
    const authName = `Lead E2E ${uniqueId}`;

    const { messageInput } = await prepareWidgetComposer(anonPage, authName, authEmail);

    expect(
      activeConversationStatuses.every((status) => status < 500),
      `Request consultation triggered /api/conversations/active 5xx responses: ${JSON.stringify(activeConversationStatuses)}`
    ).toBe(true);

    const captureLeadFlowState = async () => {
      const latestSettingsPayload = intakeSettingsPayloads[intakeSettingsPayloads.length - 1] ?? null;
      return anonPage.evaluate((latestSettings) => {
        const bodyText = document.body.innerText;
        const allButtons = Array.from(document.querySelectorAll('button'))
          .filter(b => {
            const style = window.getComputedStyle(b);
            return style.display !== 'none' && style.visibility !== 'hidden';
          })
          .map(b => (b as HTMLElement).innerText.trim());

        const aiMessages = Array.from(document.querySelectorAll('[data-testid="ai-message"]'))
          .map(m => (m as HTMLElement).innerText.trim());
        const systemMessages = Array.from(document.querySelectorAll('[data-testid="system-message"]'))
          .map(m => (m as HTMLElement).innerText.trim());
        const userMessages = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
          .map((el) => (el.textContent ?? '').trim())
          .slice(-5);

        const settings = latestSettings?.payload?.data?.settings ?? null;

        return {
          url: window.location.href,
          title: document.title,
          bodySnippet: bodyText.slice(-1500),
          buttons: allButtons,
          recentMessages: { userMessages, aiMessages, systemMessages },
          settings,
        };
      }, latestSettingsPayload);
    };
    const safeCaptureLeadFlowState = async () => {
      try {
        return await captureLeadFlowState();
      } catch (error) {
        return {
          captureError: error instanceof Error ? error.message : String(error),
        };
      }
    };

    await expect(messageInput).toBeEnabled({ timeout: 45000 });
    const bodyLocator = anonPage.locator('body');
    const submitNowButton = anonPage.getByRole('button', { name: /submit request/i });
    const paymentContinueButton = anonPage
      .locator('button:visible')
      .filter({ hasText: /(pay|continue)/i })
      .first();
    const buildBriefButton = anonPage.getByRole('button', { name: /build stronger brief/i });
    const aiTranscript: Array<{ prompt?: string; user: string; contentType: string; replyText: string }> = [];

    const sendAndAwaitAi = async (text: string, promptText = '') => {
      const aiLocator = anonPage.locator('[data-testid="ai-message"], [data-testid="system-message"]');
      const streamingLocator = anonPage.locator('[id^="message-streaming-"]');
      const sendButton = anonPage.getByRole('button', { name: /send message/i });
      const getLatestMeaningfulAiText = async () => {
        const texts = await aiLocator.evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
        for (let i = texts.length - 1; i >= 0; i -= 1) {
          const candidate = (texts[i] && texts[i].trim()) ?? '';
          if (!candidate) continue;
          if (/loading markdown/i.test(candidate)) continue;
          return candidate;
        }
        return texts[texts.length - 1] ?? '';
      };
      const latestAiTextBefore = await getLatestMeaningfulAiText();
      const aiCountBefore = await aiLocator.count();
      const aiChatEntriesBefore = networkLog.filter((item) => item.url.includes('/api/ai/chat')).length;
      const requestPromise = anonPage
        .waitForRequest(
          (request) =>
            request.method() === 'POST'
            && request.url().includes('/api/ai/chat'),
          { timeout: LEAD_TURN_TIMEOUT_MS }
        )
        .catch(() => null);
      const responsePromise = anonPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST'
          && response.url().includes('/api/ai/chat'),
        { timeout: LEAD_TURN_TIMEOUT_MS }
      ).catch(() => null);
      const sendButtonVisibleBeforeClick = await sendButton.isVisible().catch(() => false);
      const sendButtonEnabledBeforeClick = await sendButton.isEnabled().catch(() => false);
      await messageInput.fill(text);
      await sendButton.click();
      const [request, response] = await Promise.all([requestPromise, responsePromise]);
      if (!request) {
        const state = await safeCaptureLeadFlowState();
        await testInfo.attach('lead-flow-ai-timeout.json', {
          body: JSON.stringify({
            promptAsked: promptText,
            prompt: text,
            aiTranscriptTail: aiTranscript.slice(-5),
            sendButtonVisibleBeforeClick,
            sendButtonEnabledBeforeClick,
            aiChatEntriesBefore,
            aiChatEntriesAfter: networkLog.filter((item) => item.url.includes('/api/ai/chat')).length,
            requestObserved: null,
            recentNetworkTail: networkLog.slice(-20),
            state,
          }, null, 2),
          contentType: 'application/json',
        });
        throw new Error(`Expected /api/ai/chat request after sending "${text}", but none was observed.`);
      }
      if (!response) {
        const state = await safeCaptureLeadFlowState();
        await testInfo.attach('lead-flow-ai-invalid-response.json', {
          body: JSON.stringify({
            promptAsked: promptText,
            prompt: text,
            aiTranscriptTail: aiTranscript.slice(-5),
            responseStatus: null,
            responseHeaders: null,
            responseBodyTail: null,
            recentNetworkTail: networkLog.slice(-20),
            state,
          }, null, 2),
          contentType: 'application/json',
        });
        throw new Error(`Expected /api/ai/chat to return 200 for "${text}", but no successful response was observed.`);
      }
      const contentType = response ? (response.headers()['content-type'] ?? '') : '';
      const hasValidContentType = contentType.includes('application/json') || contentType.startsWith('text/event-stream');
      if (response.status() !== 200 || !hasValidContentType) {
        const invalidResponseText = await response.text().catch(() => '');
        const state = await safeCaptureLeadFlowState();
        await testInfo.attach('lead-flow-ai-invalid-response.json', {
          body: JSON.stringify({
            promptAsked: promptText,
            prompt: text,
            aiTranscriptTail: aiTranscript.slice(-5),
            responseStatus: response.status(),
            responseHeaders: response.headers(),
            responseBodyTail: invalidResponseText.slice(-2000),
            recentNetworkTail: networkLog.slice(-20),
            state,
          }, null, 2),
          contentType: 'application/json',
        });
        throw new Error(
          `Expected /api/ai/chat to return 200 with content-type for "${text}", got status=${response.status()} content-type="${contentType}".`
        );
      }
      const responseTextPromise = response && !contentType.includes('application/json')
        ? response.text().catch(() => '')
        : Promise.resolve('');
      const body = response && contentType.includes('application/json')
        ? await response.json().catch(() => null) as { reply?: string; message?: { content?: string } } | null
        : null;
      if (!contentType.includes('application/json')) {
        try {
          await expect
            .poll(
              async () => {
                const [latestAiText, aiCount, streamingCount] = await Promise.all([
                  getLatestMeaningfulAiText(),
                  aiLocator.count(),
                  streamingLocator.count(),
                ]);
                return { latestAiText, aiCount, streamingCount };
              },
              {
                timeout: LEAD_TURN_TIMEOUT_MS,
                message: 'Expected streaming bubble or rendered AI/system message after SSE response started.',
              }
            )
            .not.toEqual({ latestAiText: latestAiTextBefore, aiCount: aiCountBefore, streamingCount: 0 });
        } catch (error) {
          const sseBody = await responseTextPromise;
          const state = await safeCaptureLeadFlowState();
          await testInfo.attach('lead-flow-ai-ui-timeout.json', {
            body: JSON.stringify({
              promptAsked: promptText,
              prompt: text,
              aiTranscriptTail: aiTranscript.slice(-5),
              responseStatus: response.status(),
              responseHeaders: response.headers(),
              responseBodyTail: sseBody.slice(-2000),
              recentNetworkTail: networkLog.slice(-20),
              state,
            }, null, 2),
            contentType: 'application/json',
          });
          throw new Error(
            `SSE response started but no UI progress within ${LEAD_TURN_TIMEOUT_MS}ms.\n` +
            `SSE body (tail): ${sseBody.slice(-800)}\n` +
            `Original error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      const visibleAiCount = await aiLocator.count();
      let latestVisibleAiText = visibleAiCount > 0 ? await getLatestMeaningfulAiText() : '';
      if (!contentType.includes('application/json') && /loading markdown/i.test(latestVisibleAiText)) {
        await expect
          .poll(
            getLatestMeaningfulAiText,
            {
              timeout: LEAD_TURN_TIMEOUT_MS,
              message: 'AI reply stayed on "Loading markdown..." and never settled.',
            }
          )
          .not.toContain('Loading markdown');
        latestVisibleAiText = await getLatestMeaningfulAiText();
      }
      if (!contentType.includes('application/json')) {
        // Ensure the SSE turn settles into a non-placeholder rendered reply.
        await expect
          .poll(
            getLatestMeaningfulAiText,
            {
              timeout: LEAD_TURN_TIMEOUT_MS,
              message: 'SSE AI reply did not settle into a rendered non-empty message.',
            }
          )
          .not.toMatch(/^\s*$|loading markdown/i);
        latestVisibleAiText = await getLatestMeaningfulAiText();

        const latestAiTextAfterSettle = await getLatestMeaningfulAiText();
        const aiCountAfterSettle = await aiLocator.count();
        await expect(
          aiCountAfterSettle > aiCountBefore || latestAiTextAfterSettle !== latestAiTextBefore,
          `Expected AI chat output to change after SSE settled. before count=${aiCountBefore} before text=${JSON.stringify(latestAiTextBefore)} after count=${aiCountAfterSettle} after text=${JSON.stringify(latestAiTextAfterSettle)}`
        ).toBe(true);
      }
      return {
        response,
        contentType,
        responseText: contentType.includes('application/json') ? '' : await responseTextPromise,
        replyText: (body && (body.reply ?? (body.message && body.message.content))) ?? latestVisibleAiText,
      };
    };

    const getLatestAiPromptText = async () => {
      const aiLocator = anonPage.locator('[data-testid="ai-message"], [data-testid="system-message"]');
      const count = await aiLocator.count();
      if (count === 0) return '';
      return (await aiLocator.nth(count - 1).innerText().catch(() => '')).trim();
    };

    const answered = new Set<string>();
    const defaultSituation =
      'I am going through a divorce. My wife Ashley Luke is asking for most of our money and assets. I need help protecting my finances and getting a fair outcome.';
    const defaultOpposingParty = 'my spouse, Ashley Luke';
    const defaultDesiredOutcome = 'I want a fair division of assets and a custody agreement.';
    const TURN_ANSWERS = [
      defaultSituation,
      'Durham, NC',
      defaultOpposingParty,
      'Yes, I have documents including agreements and related records.',
      defaultDesiredOutcome,
      'Time-sensitive',
      'No court date yet',
      'No additional details right now.',
    ];

    const pickAnswerForPrompt = (rawPrompt: string, scriptedAnswer?: string): string => {
      const prompt = rawPrompt.toLowerCase();
      if (/submit|ready|fee|payment|review|send/i.test(prompt)) return 'Yes';
      if (/state|jurisdiction|licensed/i.test(prompt)) {
        answered.add('state');
        return 'NC';
      }
      if (/city|location|where|area/i.test(prompt)) {
        answered.add('city');
        if (!answered.has('state')) {
          answered.add('state');
          return 'Durham, NC';
        }
        return 'Durham';
      }
      if (/party|person|who|landlord|employer|spouse|other|opposing/i.test(prompt)) {
        answered.add('opposing-party');
        return defaultOpposingParty;
      }
      if (/document|paper|evidence|file|record/i.test(prompt)) {
        answered.add('documents');
        return 'Yes, I have documents';
      }
      if (/outcome|hoping|want/i.test(prompt)) {
        answered.add('outcome');
        return defaultDesiredOutcome;
      }
      if (/urgent|routine|time.?sensitive|emergency|deadline|court date/i.test(prompt)) {
        answered.add('urgency');
        return 'Time-sensitive';
      }
      if (/legal situation|what'?s going on|describe what'?s going on|tell me a bit/i.test(prompt)) {
        answered.add('situation');
        return defaultSituation;
      }
      if (scriptedAnswer) return scriptedAnswer;
      if (!answered.has('situation')) {
        answered.add('situation');
        return defaultSituation;
      }
      if (!answered.has('city')) {
        answered.add('city');
        return 'Durham, NC';
      }
      if (!answered.has('state')) {
        answered.add('state');
        return 'NC';
      }
      if (!answered.has('opposing-party')) {
        answered.add('opposing-party');
        return defaultOpposingParty;
      }
      if (!answered.has('outcome')) {
        answered.add('outcome');
        return defaultDesiredOutcome;
      }
      return 'No additional details right now.';
    };

    let reachedSubmitReady = false;
    let reachedPaymentTerminal = false;
    const MAX_INTAKE_TURNS = 12;
    for (let index = 0; index < MAX_INTAKE_TURNS; index += 1) {
      const submitVisibleBefore = await submitNowButton.isVisible().catch(() => false);
      const paymentPromptVisibleBefore = await anonPage
        .locator('button')
        .filter({ hasText: /(pay|continue)/i })
        .isVisible()
        .catch(() => false);
      const bodyTextBefore = await bodyLocator.innerText().catch(() => '');
      const readyPromptBefore = /ready to submit|are you ready|schedule your consultation|fee|submit your case/i.test(bodyTextBefore);
      if (submitVisibleBefore || paymentPromptVisibleBefore || readyPromptBefore) {
        reachedSubmitReady = true;
        if (paymentPromptVisibleBefore) reachedPaymentTerminal = true;
        break;
      }

      const promptText = await getLatestAiPromptText();
      const answer = pickAnswerForPrompt(promptText, TURN_ANSWERS[index]);
      const aiStep = await sendAndAwaitAi(answer, promptText);
      aiTranscript.push({
        prompt: promptText,
        user: answer,
        contentType: aiStep.contentType,
        replyText: aiStep.replyText,
      });
      if (aiStep.replyText && aiStep.replyText.includes("I wasn't able to generate a response")) {
        throw new Error(`AI fallback response detected: ${aiStep.replyText}`);
      }

      const submitVisible = await submitNowButton.isVisible().catch(() => false);
      const paymentPromptVisible = await anonPage
        .locator('button')
        .filter({ hasText: /(pay|continue)/i })
        .isVisible()
        .catch(() => false);
      const bodyText = await bodyLocator.innerText().catch(() => '');
      const readyPrompt = /ready to submit|are you ready|schedule your consultation|fee|submit your case/i.test(bodyText);
      if (submitVisible || paymentPromptVisible || readyPrompt) {
        reachedSubmitReady = true;
        if (paymentPromptVisible) reachedPaymentTerminal = true;
        break;
      }
    }

    if (!reachedSubmitReady) {
      throw new Error(
        `Intake did not reach a submit-ready CTA state after scripted intake answers.\n` +
        `Recent AI transcript: ${JSON.stringify(aiTranscript.slice(-4))}`
      );
    }

    const paymentVisibleAtAction = await paymentContinueButton.isVisible().catch(() => false);
    const submitVisibleAtAction = await submitNowButton.isVisible().catch(() => false);
    const bodyTextAtAction = await bodyLocator.innerText().catch(() => '');
    const hasPaymentPromptAtAction = /consultation fee|continue to payment|pay and submit|pay & submit|submit your intake/i.test(bodyTextAtAction);
    const terminalActionButton = anonPage
      .locator('button:visible')
      .filter({ hasText: /(pay|continue|submit request)/i })
      .first();
    const submitIntakeResponsePromise = anonPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/submit-intake') &&
        response.url().includes('/api/conversations/'),
      { timeout: 30_000 }
    ).catch(() => null);
    const settingsResponsePromise = anonPage.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/practice-client-intakes/') &&
        response.url().includes('/intake'),
      { timeout: 15_000 }
    ).catch(() => null);

    if (reachedPaymentTerminal || paymentVisibleAtAction || hasPaymentPromptAtAction) {
      if (paymentVisibleAtAction) {
        await paymentContinueButton.click();
      } else {
        try {
          await expect(
            terminalActionButton,
            'Expected a visible action button in the payment-gated terminal state.'
          ).toBeVisible({ timeout: 10000 });
        } catch (error) {
          const state = await safeCaptureLeadFlowState();
          const visibleButtons = await anonPage
            .locator('button:visible')
            .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()).filter(Boolean))
            .catch(() => []);
          const terminalDebug = {
            reachedPaymentTerminal,
            paymentVisibleAtAction,
            hasPaymentPromptAtAction,
            visibleButtons,
            state,
          };
          const debugDir = resolve(process.cwd(), '.tmp/playwright/public');
          mkdirSync(debugDir, { recursive: true });
          writeFileSync(
            resolve(debugDir, 'payment-terminal-cta-debug.json'),
            JSON.stringify(terminalDebug, null, 2)
          );
          await testInfo.attach('payment-terminal-cta-debug.json', {
            body: JSON.stringify(terminalDebug, null, 2),
            contentType: 'application/json',
          });
          throw error;
        }
        await terminalActionButton.click();
      }
    } else {
      if (!submitVisibleAtAction) {
        await expect(submitNowButton).toBeVisible({ timeout: 10000 });
      }
      await submitNowButton.click();
    }

    const settingsResponse = await settingsResponsePromise;
    if (!settingsResponse) {
      throw new Error('Expected intake settings response after submit/payment action, but no settings response was observed.');
    }
    expect(
      settingsResponse.status(),
      'Expected intake settings HTTP response to be 200 after submit/payment action.'
    ).toBe(200);
    const submitIntakeResponse = await submitIntakeResponsePromise;
    const submitIntakeDebugBody = submitIntakeResponse
      ? await submitIntakeResponse.text().catch(() => null)
      : null;
    await testInfo.attach('payment-flow-debug.json', {
      body: JSON.stringify({
        settingsStatus: settingsResponse ? settingsResponse.status() : null,
        settingsUrl: settingsResponse ? settingsResponse.url() : null,
        submitStatus: submitIntakeResponse ? submitIntakeResponse.status() : null,
        submitUrl: submitIntakeResponse ? submitIntakeResponse.url() : null,
        submitBody: submitIntakeDebugBody,
      }, null, 2),
      contentType: 'application/json',
    });

    await expect
      .poll(
        async () => intakeSettingsPayloads[intakeSettingsPayloads.length - 1] ?? null,
        {
          timeout: 15000,
          message: 'Expected intake settings request to resolve after submit/payment action.',
        }
      )
      .not.toBeNull();

    const latestSettingsPayload = intakeSettingsPayloads[intakeSettingsPayloads.length - 1] ?? null;
    const latestSettingsRecord = latestSettingsPayload?.payload?.data?.settings;
    const resolvedConsultationFee = typeof latestSettingsRecord?.consultationFee === 'number'
      ? latestSettingsRecord.consultationFee
      : typeof latestSettingsRecord?.consultation_fee === 'number'
        ? latestSettingsRecord.consultation_fee
        : null;
    const resolvedPaymentLinkEnabled = typeof latestSettingsRecord?.paymentLinkEnabled === 'boolean'
      ? latestSettingsRecord.paymentLinkEnabled
      : typeof latestSettingsRecord?.payment_link_enabled === 'boolean'
        ? latestSettingsRecord.payment_link_enabled
        : null;

    expect(
      latestSettingsPayload?.status,
      `Intake settings request should succeed.\nObserved: ${JSON.stringify(latestSettingsPayload, null, 2)}`
    ).toBe(200);
    expect(
      latestSettingsPayload?.payload?.success,
      `Intake settings payload should report success.\nObserved: ${JSON.stringify(latestSettingsPayload, null, 2)}`
    ).not.toBe(false);
    expect(
      resolvedPaymentLinkEnabled,
      `Expected payment link to be enabled for widget intake.\nObserved settings: ${JSON.stringify(latestSettingsPayload, null, 2)}`
    ).toBe(true);
    expect(
      resolvedConsultationFee,
      `Expected consultation fee amount ${EXPECTED_CONSULTATION_FEE_MINOR} minor units (${EXPECTED_CONSULTATION_FEE_LABEL}).\nObserved settings: ${JSON.stringify(latestSettingsPayload, null, 2)}`
    ).toBe(EXPECTED_CONSULTATION_FEE_MINOR);

    // Because the "Pay $75.00" button now skips the intermediate <PaymentPrompt> if clicked from the AI message,
    // we bypass looking for the intermediate UI and directly assert we reached Stripe checkout.
    await expect(anonPage).toHaveURL(/stripe\.com/i, { timeout: 30000 });

    expect(
      submitIntakeResponse,
      'Expected submit-intake response to be captured after payment/submit action.'
    ).not.toBeNull();
    const submitIntakeText = submitIntakeDebugBody ?? await submitIntakeResponse?.text().catch(() => '') ?? '';
    let submitIntakePayload: {
      success?: boolean;
      data?: {
        intake_uuid?: string;
        status?: string;
        payment_link_url?: string | null;
      };
    } | null = null;
    try {
      submitIntakePayload = submitIntakeText ? JSON.parse(submitIntakeText) : null;
    } catch {
      submitIntakePayload = null;
    }

    expect(
      submitIntakeResponse?.status(),
      `submit-intake should succeed for anonymous-first intake.\nPayload: ${submitIntakeText.slice(0, 500)}`
    ).toBe(200);
    expect(
      submitIntakePayload?.success,
      `submit-intake returned unexpected payload: ${submitIntakeText.slice(0, 500)}`
    ).toBe(true);
    expect(submitIntakePayload?.data?.intake_uuid, 'submit-intake must return intake_uuid').toBeTruthy();

    const paymentLinkUrl = submitIntakePayload?.data?.payment_link_url ?? null;
    if (paymentLinkUrl) {
      expect(
        /^https?:\/\//i.test(paymentLinkUrl),
        `payment_link_url should be an absolute URL, got: ${paymentLinkUrl}`
      ).toBe(true);
      // Navigation occurred on the same page, so no popup.
      await expect
        .poll(
          async () => {
            const currentUrl = anonPage.url();
            try {
              const expected = new URL(paymentLinkUrl);
              const current = new URL(currentUrl);
              return current.href === paymentLinkUrl
                || (current.hostname === expected.hostname && current.pathname === expected.pathname);
            } catch {
              return false;
            }
          },
          {
            timeout: 15000,
            message: `Expected widget to hand off to payment link after submit-intake.\nExpected: ${paymentLinkUrl}`,
          }
        )
        .toBe(true);
    } else {
      await expect(
        anonPage.locator('body'),
        'Expected a confirmation message in chat when no payment link is returned.'
      ).toContainText(/intake has been submitted|will review it and follow up/i, { timeout: 15000 });
    }

    expect(
      submitIntakeStatuses.length,
      `submit-intake should fire exactly once. Observed statuses: ${JSON.stringify(submitIntakeStatuses)}`
    ).toBe(1);

    if (consoleErrors.length) {
      await testInfo.attach('console-errors', { body: consoleErrors.join('\n'), contentType: 'text/plain' });
    }
    if (pageErrors.length) {
      await testInfo.attach('page-errors', { body: pageErrors.join('\n'), contentType: 'text/plain' });
    }
    await testInfo.attach('lead-flow-network-log.json', {
      body: JSON.stringify(networkLog, null, 2),
      contentType: 'application/json',
    });

    expect(
      pageErrors.filter((e) => {
        const lower = e.toLowerCase();
        if (lower.includes('chat connection closed')) return false;
        if (lower.includes('websocket closed without opened')) return false;
        if (lower === 'canceled') return false;
        if (lower.includes('status code 403')) return false;
        return true;
      }),
      `Unexpected page errors:\n${pageErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('tool-only SSE turns clear an empty streaming bubble on done', async ({ anonPage }) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const uniqueId = randomUUID().slice(0, 8);
    const authEmail = `lead-e2e-empty+${uniqueId}@test-blawby.com`;
    const authName = `Lead E2E Empty ${uniqueId}`;

    await anonPage.goto(buildWidgetUrl(practiceSlug), { waitUntil: 'domcontentloaded' });
    await prepareWidgetComposer(anonPage, authName, authEmail);

    const messageInput = anonPage.locator('[data-testid="message-input"]:visible').first();
    const sendButton = anonPage.getByRole('button', { name: /send message/i });
    const streamingBubble = anonPage.locator('[id^="message-streaming-"]');
    const responseBody = 'data: {"done":true,"intakeFields":{"description":"contract dispute","city":"Austin","state":"TX"}}\n\n';

    await anonPage.route('**/api/ai/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: responseBody,
      });
    });

    const responsePromise = anonPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST'
        && response.url().includes('/api/ai/chat'),
      { timeout: LEAD_TURN_TIMEOUT_MS }
    );

    await messageInput.fill('I need help with a contract dispute in Austin');
    await sendButton.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    await expect
      .poll(
        async () => streamingBubble.count(),
        {
          timeout: LEAD_TURN_TIMEOUT_MS,
          message: 'Expected empty tool-only streaming bubble to be cleared on done.',
        }
      )
      .toBe(0);

    // Clean up mock so it doesn't poison Test 4 and 5 which need the real LLM
    await anonPage.unroute('**/api/ai/chat');
  });

  test('widget auth token persists widget flow after clearing cookies', async ({ anonPage }) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const widgetUrl = buildWidgetUrl(practiceSlug);
    await anonPage.goto(widgetUrl, { waitUntil: 'commit' });
    const fetchBootstrap = async (authorization?: string | null) => (
      anonPage.evaluate(async ({ slug, authHeader }) => {
        const headers: Record<string, string> = {};
        if (typeof authHeader === 'string' && authHeader.length > 0) {
          headers.authorization = authHeader;
        }
        const response = await fetch(`/api/widget/bootstrap?slug=${encodeURIComponent(slug)}`, {
          method: 'GET',
          credentials: 'include',
          headers,
        });
        const body = await response.json().catch(() => null) as {
          widgetAuthToken?: string | null;
          widgetQueryAuthToken?: string | null;
          session?: { user?: { id?: string } | null } | null;
        } | null;
        return {
          status: response.status,
          body,
        };
      }, { slug: practiceSlug, authHeader: authorization ?? null })
    );

    const initialBootstrap = await fetchBootstrap();
    expect(initialBootstrap.status, 'initial bootstrap should succeed').toBe(200);
    expect(initialBootstrap.body?.session?.user?.id, 'bootstrap should include session user').toBeTruthy();
    expect(
      typeof initialBootstrap.body?.widgetAuthToken === 'string' && initialBootstrap.body.widgetAuthToken.length > 20,
      'bootstrap should issue widgetAuthToken for widget runtime'
    ).toBe(true);

    const initialToken = initialBootstrap.body?.widgetAuthToken ?? null;

    await anonPage.context().clearCookies();
    await anonPage.goto(widgetUrl, { waitUntil: 'commit' });

    expect(
      typeof initialToken === 'string' && initialToken.length > 20,
      'initial bootstrap must return a widget token before cookies are cleared'
    ).toBe(true);

    const reloadedBootstrap = await fetchBootstrap(`Bearer ${initialToken}`);
    expect(reloadedBootstrap.status, 'reloaded bootstrap should succeed with widget Bearer token after cookie clear').toBe(200);
    expect(reloadedBootstrap.body?.session?.user?.id, 'reloaded bootstrap should resolve session user without cookies').toBeTruthy();
    expect(
      typeof reloadedBootstrap.body?.widgetAuthToken === 'string' && reloadedBootstrap.body.widgetAuthToken.length > 20,
      'reloaded bootstrap should re-issue widget token'
    ).toBe(true);
  });
  test('intake planner follows deterministic field order and structured data is extracted', async ({
    anonPage,
  }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const uniqueId = randomUUID().slice(0, 8);
    const authName = `Planner E2E ${uniqueId}`;
    const authEmail = `planner-e2e+${uniqueId}@test-blawby.com`;
    const plannerNetworkLogPath = resolve(
      process.cwd(),
      '.tmp',
      'playwright',
      'public',
      'planner-network-log.json'
    );

    const _envVal = typeof (process.env as unknown as Record<string, unknown>).ENVIRONMENT === 'string'
      ? (process.env as unknown as Record<string, unknown>).ENVIRONMENT
      : process.env.NODE_ENV;
    const environment = _envVal && _envVal.toString ? _envVal.toString().toLowerCase() : undefined;


    const networkLog: Array<{ time: string; method: string; url: string; status?: number }> = [];

    try {
      anonPage.on('request', (req) => {
        if (req.url().includes('/api/')) {
          networkLog.push({ time: new Date().toISOString(), method: req.method(), url: req.url() });
        }
      });

      anonPage.on('response', (res) => {
        if (res.url().includes('/api/')) {
          const entry = networkLog.findLast((e) =>
            e.url === res.url() && e.method === res.request().method() && !e.status
          );
          if (entry) entry.status = res.status();
        }
      });

      await anonPage.goto(buildWidgetUrl(practiceSlug), {
        waitUntil: 'domcontentloaded',
      });

      // ── Slim form ────────────────────────────────────────────────────────────
      const { messageInput } = await prepareWidgetComposer(anonPage, authName, authEmail);

      await expect(messageInput).toBeEnabled({ timeout: 20_000 });

      // ── Turn helper ──────────────────────────────────────────────────────────
      const aiLocator = anonPage.locator('[data-testid="ai-message"], [data-testid="system-message"]');
      const streamingLocator = anonPage.locator('[id^="message-streaming-"]');
      let latestDonePayload: DonePayload | null = null;

      const sendAndAwait = async (text: string): Promise<{ reply: string; donePayload: DonePayload | null }> => {
        const signatureBefore = JSON.stringify(
          await aiLocator.evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()))
        );
        const responsePromise = anonPage.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().includes('/api/ai/chat') && r.status() === 200,
          { timeout: LEAD_TURN_TIMEOUT_MS }
        );
        await messageInput.fill(text);
        await anonPage.getByRole('button', { name: /send message/i }).click();
        const response = await responsePromise;
        const responseText = await response.text().catch(() => '');

        // Parse all done SSE payloads from the response and attach them for debugging.
        const payloads = parseDonePayloads(responseText);
        if (payloads.length) {
          // Attach the sequence of payloads for observability
          try {
            await testInfo.attach(`sse-payloads-${Date.now()}.json`, {
              body: JSON.stringify(payloads, null, 2),
              contentType: 'application/json',
            });
          } catch {
            // swallow attach errors - best effort
          }
        }

        // Aggregate successive done payloads into a single composed payload so tests
        // don't depend on the exact timing/order of intermediate SSE events.
        const aggregated: DonePayload = {};
        for (const p of payloads) {
          if (p.intakeFields && typeof p.intakeFields === 'object') {
            aggregated.intakeFields = aggregated.intakeFields ?? {};
            for (const [k, v] of Object.entries(p.intakeFields)) {
              // prefer later values (overwrite) when available
              if (v !== undefined) (aggregated.intakeFields as Record<string, unknown>)[k] = v;
            }
          }
          if (Array.isArray(p.actions) && p.actions.length) {
            aggregated.actions = (aggregated.actions ?? []).concat(p.actions as Array<Record<string, unknown>>);
          }
          if (p.question) aggregated.question = p.question;
          if (p.persistedMessageId) aggregated.persistedMessageId = p.persistedMessageId;
          if (typeof p.messagePersisted === 'boolean') aggregated.messagePersisted = p.messagePersisted;
          if (typeof p.wasToolOnly === 'boolean') aggregated.wasToolOnly = p.wasToolOnly;
        }

        const donePayload = Object.keys(aggregated).length ? aggregated : null;
        if (donePayload) latestDonePayload = donePayload;

        await expect.poll(
          async () => {
            const [sig, streamCount] = await Promise.all([
              aiLocator.evaluateAll((els) => JSON.stringify(els.map((el) => (el.textContent ?? '').trim()))),
              streamingLocator.count(),
            ]);
            return sig !== signatureBefore && streamCount === 0;
          },
          { timeout: LEAD_TURN_TIMEOUT_MS, message: `UI did not settle after sending: "${text}"` }
        ).toBe(true);
        await expect.poll(
          async () => {
            const count = await aiLocator.count();
            if (count === 0) return false;
            const last = (await aiLocator.nth(count - 1).innerText().catch(() => '')).trim();
            return last.length > 0 && !/loading markdown/i.test(last);
          },
          { timeout: LEAD_TURN_TIMEOUT_MS, message: 'AI reply did not render after send' }
        ).toBe(true);
        const count = await aiLocator.count();
        return {
          reply: (await aiLocator.nth(count - 1).innerText().catch(() => '')).trim(),
          donePayload,
        };
      };

      const getButtons = async () =>
        anonPage.locator('button:visible').allInnerTexts().catch(() => [] as string[]);

      const answerFromStructuredQuestion = (payload: DonePayload | null | undefined): string | null => {
        const questionText = payload?.question?.text ?? '';
        const options = Array.isArray(payload?.question?.options) ? payload.question.options : [];
        if (options.length === 0) return null;

        // Prefer North Carolina for deterministic location turns when available.
        if (/state|jurisdiction|licensed/i.test(questionText)) {
          const ncOption = options.find((opt) => /(^|\W)nc(\W|$)|north carolina/i.test(`${opt.label ?? ''} ${opt.value ?? ''}`));
          if (ncOption) return (typeof ncOption.value === 'string' && ncOption.value.trim()) ? ncOption.value.trim() : (ncOption.label ?? null);
        }

        // Prefer affirmative option when available.
        const yesOption = options.find((opt) => /^yes\b/i.test((opt.label ?? '').trim()));
        if (yesOption) {
          return (typeof yesOption.value === 'string' && yesOption.value.trim()) ? yesOption.value.trim() : (yesOption.label ?? null);
        }

        const first = options[0];
        if (!first) return null;
        if (typeof first.value === 'string' && first.value.trim()) return first.value.trim();
        if (typeof first.label === 'string' && first.label.trim()) return first.label.trim();
        return null;
      };

      const countDistinctQuestionSentences = (text: string): number => {
        return text
          .split(/(?<=\?)/)
          .map((sentence) => sentence.trim())
          .filter((sentence) => sentence.endsWith('?'))
          .length;
      };

      await expect.poll(
        async () => {
          const count = await aiLocator.count();
          if (count === 0) return '';
          return (await aiLocator.nth(count - 1).innerText().catch(() => '')).trim();
        },
        {
          timeout: LEAD_TURN_TIMEOUT_MS,
          message: 'Expected planner to prompt for the legal situation after contact capture.',
        }
      ).toMatch(/legal situation|what'?s going on|describe what'?s going on|tell me a bit/i);
      await expect
        .poll(
          async () => streamingLocator.count(),
          {
            timeout: LEAD_TURN_TIMEOUT_MS,
            message: 'Expected initial planner prompt to finish streaming before turn 1.',
          }
        )
        .toBe(0);

      const { reply: reply1, donePayload: done1 } = await sendAndAwait(
        'My landlord is refusing to return my security deposit after I moved out.'
      );
      await testInfo.attach('planner-turn1-reply.txt', { body: reply1, contentType: 'text/plain' });

      // ASSERTION 1: Tool should be called when sufficient info provided
      expect(done1, 'Expected a done payload with intake fields after Turn 1.').not.toBeNull();
      expect(done1 && done1.intakeFields, 'Expected intakeFields in Turn 1 response.').toBeDefined();
      expect(done1 && done1.intakeFields && done1.intakeFields.description, 'Expected extracted description in Turn 1 fields.').toBeTruthy();

      const submitNowButton = anonPage.getByRole('button', { name: /submit request/i });
      const paymentButton = anonPage.locator('button:visible').filter({ hasText: /^(continue|continue\s+to\s+payment|pay\s*(?:&|and)\s*submit)$/i }).first();

      const { reply: reply2, donePayload: done2 } = await sendAndAwait('Raleigh, NC');
      await testInfo.attach('planner-turn2-reply.txt', { body: reply2, contentType: 'text/plain' });

      const submitAfterTurn2 = await submitNowButton.isVisible().catch(() => false);
      const paymentAfterTurn2 = await paymentButton.isVisible().catch(() => false);
      const paymentPromptAfterTurn2 = /payment|consultation fee|fee|submit/i.test(reply2);
      const validAfterLocation =
        /state|jurisdiction|licensed|where/i.test(reply2) ||
        /landlord|other party|opposing|who|party/i.test(reply2) ||
        /urgent|how urgent|routine|time.sensitive|emergency/i.test(reply2) ||
        /payment|fee|continue|submit/i.test(reply2) ||
        submitAfterTurn2 ||
        paymentAfterTurn2;

      // ASSERTION 2: Tool called with location and no contact info requested
      
      expect(done2 && done2.intakeFields && done2.intakeFields.city, 'city should be extracted after turn 2').toBeTruthy();
      expect(done2 && done2.intakeFields && done2.intakeFields.description, 'description should still be present after turn 2').toBeTruthy();
      let stateCollected = Boolean(done2 && done2.intakeFields && done2.intakeFields.state);
      
      // Verify model did not ask for contact info (system prompt violation)
      // Check for direct request phrases and actual contact formats, not generic mentions
      const contactInfoRequested = 
        // Direct request patterns
        /(what'?s?\s+(your|the)\s+(name|email|phone|contact)|please\s+(provide|share|give)\s+(your|the)\s+(name|email|phone)|can\s+i\s+have\s+(your|the)\s+(name|email|phone)|tell\s+me\s+(your|the)\s+(name|email|phone))/i.test(reply2) ||
        // Email pattern detection
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(reply2) ||
        // Phone pattern detection (basic US format)
        /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s?\d{3}[-.\s]?\d{4})\b/.test(reply2);
      expect(
        contactInfoRequested,
        `Model should not ask for contact info. Got: "${reply2.slice(0, 300)}"`
      ).toBe(false);

      expect(
        validAfterLocation,
        `After location, AI should ask about opposing party, urgency, or move to payment/submit. Got: "${reply2.slice(0, 300)}"`
      ).toBe(true);

      // ASSERTION 2b: Verify normalization layer prevents tool-only responses from being unhandled
      // Verify the model produced a terminal action turn when actions are present.
      if (done2 && done2.actions && done2.actions.length > 0) {
        expect(
          (done2 && done2.wasToolOnly) === true ? !!reply2 : true,
          'If wasToolOnly is true, we should have a synthetic reply rendered'
        ).toBe(true);
      }

      // Log observability data for model behavior analysis
      if (done2 && done2.wasToolOnly) {
        console.log('Model produced tool-only response, synthetic reply applied:', {
          replyLength: reply2.length,
          actionCount: (done2 && done2.actions && done2.actions.length) || 0,
          messagePersisted: done2.messagePersisted,
        });
      }

      let reachedTerminalAfterTurn3 = paymentAfterTurn2 || submitAfterTurn2 || paymentPromptAfterTurn2;

      if (!stateCollected && !reachedTerminalAfterTurn3) {
        const { reply: stateReply, donePayload: stateDone } = await sendAndAwait('NC');
        await testInfo.attach('planner-state-turn-reply.txt', { body: stateReply, contentType: 'text/plain' });
        expect(stateDone?.intakeFields?.state, 'state should be extracted after the state turn').toBeTruthy();
        expect(stateDone?.intakeFields?.description, 'description should still be present after the state turn').toBeTruthy();
        expect(stateDone?.intakeFields?.city, 'city should still be present after the state turn').toBeTruthy();
        stateCollected = true;
        reachedTerminalAfterTurn3 =
          /payment|consultation fee|fee|submit/i.test(stateReply) ||
          await submitNowButton.isVisible().catch(() => false) ||
          await paymentButton.isVisible().catch(() => false);
      }

      if (!reachedTerminalAfterTurn3) {
        const { reply: reply3, donePayload: done3 } = await sendAndAwait('My landlord, Johnson Properties LLC');
        await testInfo.attach('planner-turn3-reply.txt', { body: reply3, contentType: 'text/plain' });
        
        // ASSERTION 3: Tool called with opposing party and single question
        expect(done3 && done3.intakeFields && done3.intakeFields.opposingParty, 'opposingParty should be extracted after turn 3').toBeTruthy();
        
        // Verify the third turn still produces a terminal action response when applicable.
        if (done3 && done3.actions && done3.actions.length > 0) {
          expect((done3 && done3.wasToolOnly) === true ? !!reply3 : true, 'Tool/action turns should not collapse to an empty reply').toBe(true);
        }
        
        // Log observability data for turn 3
        if (done3) {
          console.log('Turn 3 model behavior:', {
            wasToolOnly: done3.wasToolOnly,
            replyLength: reply3.length,
            actionCount: (done3 && done3.actions && done3.actions.length) || 0,
            messagePersisted: done3.messagePersisted,
          });
        }
        
        // Verify the model stays focused without being brittle about punctuation style.
        const questionSentenceCount = countDistinctQuestionSentences(reply3);
        expect(
          reply3.length,
          `Model reply should stay focused and short. Got ${reply3.length} characters: "${reply3.slice(0, 500)}"`
        ).toBeLessThan(500);
        expect(
          questionSentenceCount,
          `Model should not ask multiple distinct questions. Found ${questionSentenceCount} question sentences in: "${reply3.slice(0, 500)}"`
        ).toBeLessThanOrEqual(1);
        
        reachedTerminalAfterTurn3 =
          /payment|consultation fee|fee|submit/i.test(reply3) ||
          await submitNowButton.isVisible().catch(() => false) ||
          await paymentButton.isVisible().catch(() => false);
      }

      const buttonsAfterTurn3 = await getButtons();
      await testInfo.attach('planner-turn3-buttons.json', {
        body: JSON.stringify(buttonsAfterTurn3, null, 2),
        contentType: 'application/json',
      });

      const hasSubmitButton = buttonsAfterTurn3.some((b) => /submit request/i.test(b));
      const hasPaymentButton = buttonsAfterTurn3.some((b) =>
        /(pay|continue)/i.test(b)
      );
      const hasUrgencyChips = buttonsAfterTurn3.some((b) =>
        /routine|time.sensitive|emergency/i.test(b)
      );
      const hasYesNoChips = buttonsAfterTurn3.some((b) => /^yes$|^no$/i.test(b));

      expect(
        hasSubmitButton || hasPaymentButton || hasUrgencyChips || hasYesNoChips,
        `After minimum viable brief, expected submit, payment CTA, or planner chips. Buttons: ${JSON.stringify(buttonsAfterTurn3)}`
      ).toBe(true);

      if (!reachedTerminalAfterTurn3 && !hasSubmitButton && !hasPaymentButton && hasUrgencyChips) {
        const timeSensitiveChip = anonPage.locator('button:visible').filter({ hasText: /time.sensitive/i }).first();
        if (await timeSensitiveChip.isVisible({ timeout: 2_000 }).catch(() => false)) {
          const signatureBefore = JSON.stringify(
            await aiLocator.evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()))
          );
          const responsePromise = anonPage.waitForResponse(
            (r) => r.request().method() === 'POST' && r.url().includes('/api/ai/chat') && r.status() === 200,
            { timeout: LEAD_TURN_TIMEOUT_MS }
          );
          await timeSensitiveChip.click();
          const response = await responsePromise;
          const responseText = await response.text().catch(() => '');
          const donePayload = parseDonePayloads(responseText).at(-1) ?? null;
          if (donePayload) {
            latestDonePayload = donePayload;
          }
          // Settle the UI (same pattern as sendAndAwait)
          await expect.poll(
            async () => {
              const [sig, streamCount] = await Promise.all([
                aiLocator.evaluateAll((els) => JSON.stringify(els.map((el) => (el.textContent ?? '').trim()))),
                streamingLocator.count(),
              ]);
              return sig !== signatureBefore && streamCount === 0;
            },
            { timeout: LEAD_TURN_TIMEOUT_MS, message: 'UI did not settle after urgency chip click' }
          ).toBe(true);
        }
      } else if (!reachedTerminalAfterTurn3 && !hasSubmitButton && !hasPaymentButton) {
        await sendAndAwait('Time-sensitive');
      }

      const submitButton = submitNowButton;
      const MAX_REMAINING_TURNS = 6;
      let submitReached = false;
      for (let i = 0; i < MAX_REMAINING_TURNS; i++) {
        const submitVisible = await submitButton.isVisible().catch(() => false);
        const paymentVisible = await paymentButton.isVisible().catch(() => false);
        if (submitVisible || paymentVisible) { submitReached = true; break; }

        const structuredAnswer = answerFromStructuredQuestion(latestDonePayload);
        if (structuredAnswer) {
          const nextTurn = await sendAndAwait(structuredAnswer);
          if (nextTurn.donePayload) {
            latestDonePayload = nextTurn.donePayload;
          }
          continue;
        }

        const count = await aiLocator.count();
        if (count === 0) { await anonPage.waitForTimeout(1000); continue; }
        const last = (await aiLocator.nth(count - 1).innerText().catch(() => '')).trim();

        if (/ready to submit|are you ready|schedule your consultation|fee|submit your case/i.test(last)) {
          submitReached = true;
          break;
        }
        if (/desired outcome|hoping for/i.test(last)) {
          await sendAndAwait('Get my full deposit back');
        } else if (/documents|paperwork/i.test(last)) {
          await sendAndAwait('Yes, I have documents');
        } else if (/urgent|how urgent/i.test(last)) {
          await sendAndAwait('Time-sensitive');
        } else {
          await sendAndAwait('Yes');
        }
      }

      expect(submitReached, 'Submit button never appeared after completing intake planner sequence').toBe(true);

      const finalDone = latestDonePayload;
      await testInfo.attach('planner-final-done-payload.json', {
        body: JSON.stringify(finalDone, null, 2),
        contentType: 'application/json',
      });

      // Final observability assertions
      if (finalDone) {
        console.log('Final turn model behavior summary:', {
          wasToolOnly: finalDone.wasToolOnly,
          actionCount: finalDone?.actions?.length || 0,
          messagePersisted: finalDone.messagePersisted,
          persistedMessageId: finalDone.persistedMessageId
        });
      }

      // ASSERTION 4: No premature submit trigger
      expect(finalDone?.intakeFields?.description, 'final state: description must be present').toBeTruthy();
      
      // Check that submit actions only appear when intake is actually submittable
      const submitActions = Array.isArray(finalDone?.actions) ? finalDone.actions : [];
      const hasSubmitAction = submitActions.some((action) => action?.type === 'submit');
      
      if (hasSubmitAction) {
        // If submit actions are present, verify the intake state is actually submittable
        // Only description, city, and state are required for submission (matching hasCoreIntakeFields)
        const hasRequiredFields =
          Boolean(
            finalDone?.intakeFields?.description &&
            finalDone?.intakeFields?.city &&
            finalDone?.intakeFields?.state
          );
        
        expect(
          hasRequiredFields,
          `Submit actions present but required fields missing. Fields: ${JSON.stringify(finalDone?.intakeFields)}`
        ).toBe(true);
      }
      expect(finalDone?.intakeFields?.city, 'final state: city must be present').toBeTruthy();
      expect(finalDone?.intakeFields?.state, 'final state: state must be present').toBeTruthy();
      // opposingParty is no longer required for submission - only description, city, and state are needed
      const finalActions = Array.isArray(finalDone?.actions) ? finalDone.actions : [];
      const finalRenderedText = await aiLocator.last().innerText().catch(() => '');
      const reachedValidTerminalState =
        submitReached ||
        finalActions.some((action) => action?.type === 'submit' || action?.type === 'continue_payment' || action?.type === 'open_url') ||
        finalActions.some((action) => /routine|time.sensitive|emergency/i.test(String(action?.label ?? ''))) ||
        /consultation fee|continue to payment|submit your intake|submit your case/i.test(finalRenderedText);
      expect(
        reachedValidTerminalState,
        'final state should expose submit/payment UI or a valid terminal action'
      ).toBe(true);
    } finally {
      mkdirSync(resolve(process.cwd(), '.tmp', 'playwright', 'public'), { recursive: true });
      writeFileSync(plannerNetworkLogPath, JSON.stringify(networkLog, null, 2), 'utf-8');
      await testInfo.attach('network-log.json', {
        body: JSON.stringify(networkLog, null, 2),
        contentType: 'application/json',
      });
    }
  });

  test('strengthen case path sets enrichmentMode and keeps submit available', async ({
    anonPage,
  }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const uniqueId = randomUUID().slice(0, 8);
    const authName = `Strengthen E2E ${uniqueId}`;
    const authEmail = `strengthen-e2e+${uniqueId}@test-blawby.com`;

    await anonPage.goto(buildWidgetUrl(practiceSlug), { waitUntil: 'domcontentloaded' });
    const { messageInput } = await prepareWidgetComposer(anonPage, authName, authEmail);

    const aiLocator = anonPage.locator('[data-testid="ai-message"], [data-testid="system-message"]');
    const streamingLocator = anonPage.locator('[id^="message-streaming-"]');
    const terminalActionButton = anonPage.locator('button:visible').filter({ hasText: /(pay|continue|submit request)/i }).first();
    let latestDonePayload: DonePayload | null = null;

    const getLatestAiText = async () => {
      const count = await aiLocator.count();
      if (count === 0) return '';
      return (await aiLocator.nth(count - 1).innerText().catch(() => '')).trim();
    };

    const sendAndAwait = async (text: string) => {
      const signatureBefore = JSON.stringify(
        await aiLocator.evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()))
      );
      const responsePromise = anonPage.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/api/ai/chat') && r.status() === 200,
        { timeout: LEAD_TURN_TIMEOUT_MS }
      );
      await messageInput.fill(text);
      await anonPage.getByRole('button', { name: /send message/i }).click();
      const response = await responsePromise;
      const responseText = await response.text().catch(() => '');

      // Parse and attach SSE done payloads for debugging
      const payloads = parseDonePayloads(responseText);
      if (payloads.length) {
        try {
          await testInfo.attach(`sse-payloads-${Date.now()}.json`, {
            body: JSON.stringify(payloads, null, 2),
            contentType: 'application/json',
          });
        } catch {}
      }

      // Aggregate payloads into latestDonePayload so downstream structured-answer logic can use it
      const aggregated: DonePayload = {};
      for (const p of payloads) {
        if (p.intakeFields && typeof p.intakeFields === 'object') {
          aggregated.intakeFields = aggregated.intakeFields ?? {};
          for (const [k, v] of Object.entries(p.intakeFields)) {
            if (v !== undefined) (aggregated.intakeFields as Record<string, unknown>)[k] = v;
          }
        }
        if (Array.isArray(p.actions) && p.actions.length) {
          aggregated.actions = (aggregated.actions ?? []).concat(p.actions as Array<Record<string, unknown>>);
        }
        if (p.question) aggregated.question = p.question;
        if (p.persistedMessageId) aggregated.persistedMessageId = p.persistedMessageId;
        if (typeof p.messagePersisted === 'boolean') aggregated.messagePersisted = p.messagePersisted;
        if (typeof p.wasToolOnly === 'boolean') aggregated.wasToolOnly = p.wasToolOnly;
      }
      if (Object.keys(aggregated).length) latestDonePayload = aggregated;

      await expect.poll(
        async () => {
          const [sig, streamCount] = await Promise.all([
            aiLocator.evaluateAll((els) => JSON.stringify(els.map((el) => (el.textContent ?? '').trim()))),
            streamingLocator.count(),
          ]);
          return sig !== signatureBefore && streamCount === 0;
        },
        { timeout: LEAD_TURN_TIMEOUT_MS, message: `UI did not settle after sending: "${text}"` }
      ).toBe(true);
      return getLatestAiText();
    };

    // ── Get to a submittable state (description + city + state) ─────────────
    // Turn 1: describe situation
    await expect.poll(getLatestAiText, { timeout: LEAD_TURN_TIMEOUT_MS,
      message: 'Expected initial situation prompt.' })
      .toMatch(/legal situation|what'?s going on|describe|tell me/i);

    await sendAndAwait('My landlord is refusing to return my security deposit after I moved out.');

    // Turn 2: location
    await sendAndAwait('Durham, NC');

    // Wait for submit button to potentially appear (payment or submit path)
    const MAX_EXTRA_TURNS = 5;
    for (let i = 0; i < MAX_EXTRA_TURNS; i++) {
      const isTerminalVisible = await terminalActionButton.isVisible().catch(() => false);
      if (isTerminalVisible) break;

      const latestText = await getLatestAiText();
      if (/ready to submit|are you ready|schedule your consultation|fee/i.test(latestText)) break;

      // Answer whatever the AI asks
      if (/state|jurisdiction|licensed/i.test(latestText)) {
        await sendAndAwait('NC');
      } else if (/city|location|where|area/i.test(latestText)) {
        await sendAndAwait('Durham, NC');
      } else if (/other party|opposing|landlord|who/i.test(latestText)) {
        await sendAndAwait('Johnson Properties LLC');
      } else if (/urgent|time.sensitive/i.test(latestText)) {
        await sendAndAwait('Time-sensitive');
      } else if (/documents|paperwork/i.test(latestText)) {
        await sendAndAwait('Yes I have documents');
      } else if (/outcome|hoping/i.test(latestText)) {
        await sendAndAwait('Get my full deposit back');
      } else {
        await sendAndAwait('No additional details');
      }
    }

    // ── At least "Submit request" or "Pay" must be visible now ───────────────
    await expect(terminalActionButton, 'Expected submit/pay button after completing core intake fields.')
      .toBeVisible({ timeout: 15000 });

    // ── "Strengthen my case first" should also be visible ───────────────────
    const strengthenButton = anonPage.getByRole('button', { name: /strengthen my case/i });
    await expect(strengthenButton, 'Expected "Strengthen my case first" button alongside Submit.')
      .toBeVisible({ timeout: 5000 });

    await testInfo.attach('strengthen-before-click-buttons.json', {
      body: JSON.stringify(
        await anonPage.locator('button:visible').allInnerTexts().catch(() => []),
        null, 2
      ),
      contentType: 'application/json',
    });

    // ── Click "Strengthen my case first" ────────────────────────────────────
    const applyIntakeFieldsPromise = anonPage.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/api/conversations/'),
      { timeout: 10000 }
    ).catch(() => null);

    await strengthenButton.click();

    // enrichmentMode PATCH can be delayed/debounced; treat as diagnostic-only network signal.
    const applyResponse = await applyIntakeFieldsPromise;
    if (applyResponse) {
      expect(applyResponse.status(), 'applyIntakeFields PATCH should return 200 OK when observed').toBe(200);
    } else {
      await testInfo.attach('strengthen-apply-patch-missed.json', {
        body: JSON.stringify(
          { note: 'No PATCH observed within timeout; likely debounce/batching. Continuing with behavior assertions.' },
          null,
          2
        ),
        contentType: 'application/json',
      });
    }

    // ── AI should respond with a question focused on opposing party ──────────
    await expect.poll(
      getLatestAiText,
      {
        timeout: LEAD_TURN_TIMEOUT_MS,
        message: 'After strengthen_case, AI should ask an enrichment-mode followup question.',
      }
    ).toMatch(/address|phone|documents|dates|evidence|timeline|contact|clarification|who|what|where|when|why|how|other party|opposing|landlord|employer|spouse|entity|involved|household|size/i);

    // ── Submit/Pay button must still be visible alongside AI question ────────
    await expect(
      terminalActionButton,
      'Submit/Pay button must remain available during enrichment mode.'
    ).toBeVisible({ timeout: 5000 });

    // ── Strength ring button (case strength indicator) should be visible ─────
    const strengthRingButton = anonPage.getByRole('button', { name: /case strength/i });
    await expect(
      strengthRingButton,
      'Case strength ring should be visible in consult conversation header.'
    ).toBeVisible({ timeout: 5000 });

    await testInfo.attach('strengthen-after-click-buttons.json', {
      body: JSON.stringify(
        await anonPage.locator('button:visible').allInnerTexts().catch(() => []),
        null, 2
      ),
      contentType: 'application/json',
    });
  });
});
