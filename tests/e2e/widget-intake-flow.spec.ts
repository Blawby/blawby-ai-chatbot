import { expect, test } from './fixtures.public';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_PRACTICE_SLUG = process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';
const rawBudget = process.env.E2E_WIDGET_AI_RESPONSE_BUDGET_MS;
const parsedBudget = rawBudget ? parseInt(rawBudget, 10) : 30000;
const MAX_AI_RESPONSE_MS = Number.isFinite(parsedBudget) ? parsedBudget : 90000;
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
  `/public/${encodeURIComponent(practiceSlug)}?v=widget&debugQuickActions=1`
);

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

  await expect
    .poll(
      async () => {
        const inputEnabled = await messageInput.isEnabled({ timeout: 250 }).catch(() => false);
        const requestConsultationVisible = await consultationCta.isVisible({ timeout: 250 }).catch(() => false);
        return inputEnabled || requestConsultationVisible;
      },
      {
        timeout: 25_000,
        message: 'Expected widget bootstrap to render either the composer or request consultation CTA.',
      }
    )
    .toBe(true);

  if (await consultationCta.isVisible({ timeout: 1000 }).catch(() => false)) {
    await consultationCta.click({ timeout: 1000 }).catch(() => undefined);
  }

  await expect
    .poll(
      async () => {
        const inputEnabled = await messageInput.isEnabled({ timeout: 300 }).catch(() => false);
        const formVisible = await slimFormName.isVisible({ timeout: 300 }).catch(() => false);
        return inputEnabled || formVisible;
      },
      {
        timeout: 30_000,
        message: 'Expected slim form or composer after opening the public widget flow.',
      }
    )
    .toBe(true);

  if (await slimFormName.isVisible({ timeout: 500 }).catch(() => false)) {
    await expect(slimFormName).toBeEditable({ timeout: 5000 });
    await slimFormName.fill(authName);
    if (await slimFormEmail.isVisible({ timeout: 500 }).catch(() => false)) {
      await slimFormEmail.fill(authEmail);
    }
    if (await slimFormPhone.isVisible({ timeout: 500 }).catch(() => false)) {
      await slimFormPhone.fill('555-555-1212');
    }
    await slimFormContinue.click();
    await expect(messageInput).toBeEnabled({ timeout: 15_000 });
  } else {
    await expect(messageInput).toBeEnabled({ timeout: 15_000 });
  }

  return { messageInput };
};

test.describe('Public widget intake flow', () => {
  test.describe.configure({ timeout: 120000 });

  test.beforeEach(async ({ anonPage }) => {
    const storageResetToken = `widget-intake-flow-${randomUUID()}`;
    await anonPage.addInitScript((token: string) => {
      try {
        if (window.name === token) {
          return;
        }
        const keysToRemove = Object.keys(sessionStorage).filter((key) =>
          key.startsWith('blawby_widget_bootstrap_')
          || key === 'blawby:widget:attribution'
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
    });

    await anonPage.goto(buildWidgetUrl(practiceSlug), { waitUntil: 'domcontentloaded' });

    const messageInput = anonPage.locator('[data-testid="message-input"]:visible').first();
    const consultationCta = anonPage.locator('button:visible').filter({ hasText: /request consultation/i }).first();
    try {
      await expect
        .poll(
          async () => ({
            ctaVisible: await consultationCta.isVisible().catch(() => false),
            composerVisible: await messageInput.isVisible().catch(() => false),
          }),
          {
            timeout: 20000,
            message: 'Expected widget home CTA or message composer to render on public widget page.',
          }
        )
        .not.toEqual({ ctaVisible: false, composerVisible: false });
    } catch (error) {
      const startupDebug = await anonPage.evaluate(() => {
        const bodyText = document.body?.innerText ?? '';
        const buttons = Array.from(document.querySelectorAll('button'))
          .map((el) => (el.textContent ?? '').trim())
          .filter(Boolean)
          .slice(0, 40);
        return {
          url: window.location.href,
          title: document.title,
          bodySnippet: bodyText.slice(0, 3000),
          buttons,
        };
      }).catch(() => null);
      await testInfo.attach('lead-flow-startup-debug.json', {
        body: JSON.stringify({ startupDebug, networkLog }, null, 2),
        contentType: 'application/json',
      });
      throw error;
    }
    if (await consultationCta.isVisible().catch(() => false)) {
      await consultationCta.click();
      await anonPage.waitForTimeout(1200);
      expect(
        activeConversationStatuses.every((status) => status < 500),
        `Request consultation triggered /api/conversations/active 5xx responses: ${JSON.stringify(activeConversationStatuses)}`
      ).toBe(true);
    }

    const slimFormName = anonPage.locator('input[placeholder*="full name" i]:visible').first();
    const slimFormEmail = anonPage.locator('input[type="email"]:visible').first();
    const slimFormPhone = anonPage.locator('input[type="tel"]:visible').first();
    const slimFormContinue = anonPage.locator('button:visible').filter({ hasText: /^continue$/i }).first();
    const uniqueId = randomUUID().slice(0, 8);
    const authEmail = `lead-e2e+${uniqueId}@example.com`;
    const authName = `Lead E2E ${uniqueId}`;
    const captureLeadFlowState = async () => {
      return anonPage.evaluate(() => {
        const bodyText = document.body?.innerText ?? '';
        const allButtons = Array.from(document.querySelectorAll('button'))
          .map((el) => (el.textContent ?? '').trim())
          .filter(Boolean)
          .slice(-20);
        const aiMessages = Array.from(document.querySelectorAll('[data-testid="ai-message"]'))
          .map((el) => (el.textContent ?? '').trim())
          .slice(-5);
        const systemMessages = Array.from(document.querySelectorAll('[data-testid="system-message"]'))
          .map((el) => (el.textContent ?? '').trim())
          .slice(-5);
        const userMessages = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
          .map((el) => (el.textContent ?? '').trim())
          .slice(-5);
        return {
          url: window.location.href,
          title: document.title,
          bodySnippet: bodyText.slice(-1500),
          buttons: allButtons,
          recentMessages: { userMessages, aiMessages, systemMessages },
        };
      });
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
    {
      const deadline = Date.now() + 30_000;
      let lastStep = 'init';
      let attemptCount = 0;
      while (Date.now() < deadline) {
        attemptCount += 1;
        if (await messageInput.isEnabled({ timeout: 250 }).catch(() => false)) {
          lastStep = 'composer-ready';
          break;
        }

        if (await consultationCta.isVisible({ timeout: 250 }).catch(() => false)) {
          await consultationCta.click({ timeout: 1000 }).catch(() => undefined);
          lastStep = 'cta-clicked';
        }

        const continueVisible = await slimFormContinue.isVisible({ timeout: 250 }).catch(() => false);
        if (continueVisible) {
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
            await slimFormContinue.click({ timeout: 1000 }).catch(() => undefined);
            lastStep = 'continue-clicked';
          } else {
            lastStep = 'continue-disabled';
          }
        } else if (lastStep === 'init') {
          lastStep = 'waiting';
        }

        await anonPage.waitForTimeout(500);
      }

      if (lastStep !== 'composer-ready') {
        const entryDebug = await captureLeadFlowState();
        await testInfo.attach('lead-flow-slim-form-debug.json', {
          body: JSON.stringify({ lastStep, attemptCount, entryDebug }, null, 2),
          contentType: 'application/json',
        });
        throw new Error(`Slim form did not advance to an enabled composer (lastStep=${lastStep}, attempts=${attemptCount}).`);
      }
    }

    await expect(messageInput).toBeEnabled({ timeout: 45000 });
    const bodyLocator = anonPage.locator('body');
    const submitNowButton = anonPage.getByRole('button', { name: /submit request/i });
    const paymentContinueButton = anonPage
      .locator('button:visible')
      .filter({ hasText: /^(continue|continue\s+to\s+payment|pay\s*(?:&|and)\s*submit)$/i })
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
          const candidate = texts[i]?.trim() ?? '';
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
      const contentType = response?.headers()['content-type'] ?? '';
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
      const visibleAiMessages = aiLocator;
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
        replyText: body?.reply ?? body?.message?.content ?? latestVisibleAiText,
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

    const pickAnswerForPrompt = (rawPrompt: string): string => {
      const prompt = rawPrompt.toLowerCase();
      if (/ready to submit your case|are you ready to submit|submit your case to the firm/.test(prompt)) return 'Yes';
      if (/legal situation|what'?s going on|describe what'?s going on|tell me a bit/.test(prompt)) {
        answered.add('situation');
        return defaultSituation;
      }
      if (/city and state|what city|where.*(located|live)|what state/.test(prompt)) {
        answered.add('location');
        return 'durham nc';
      }
      if (/other party|opposing party|who.*(other party|opposing|landlord|employer|spouse|driver)/i.test(prompt)) {
        answered.add('opposing-party');
        return defaultOpposingParty;
      }
      if (/deadline|court date/.test(prompt)) {
        answered.add('deadlines');
        return 'not that i know of';
      }
      if (/another party involved|other party involved/.test(prompt)) {
        answered.add('party-involved');
        return 'yes, my wife ashley luke';
      }
      if (/only other party|only party involved/.test(prompt)) {
        answered.add('party-only');
        return 'yes, only my wife';
      }
      if (/what outcome|hoping for|what do you want/.test(prompt)) {
        answered.add('outcome');
        return defaultDesiredOutcome;
      }
      if (/how urgent|routine|time.sensitive|emergency|deadline|court date/i.test(prompt)) {
        answered.add('urgency');
        return 'Time-sensitive';
      }
      if (/documents|paperwork|evidence|files/.test(prompt)) {
        answered.add('documents');
        return 'Yes, I have documents';
      }
      if (/anything else|more to share|other details|add anything|anything you'd like to share/.test(prompt)) {
        answered.add('other-details');
        return 'The opposing party is my wife, Ashley Luke.';
      }
      if (!answered.has('situation')) {
        answered.add('situation');
        return defaultSituation;
      }
      if (!answered.has('location')) {
        answered.add('location');
        return 'durham nc';
      }
      if (!answered.has('deadlines')) {
        answered.add('deadlines');
        return 'not that i know of';
      }
      if (!answered.has('party-involved')) {
        answered.add('party-involved');
        return 'yes, my wife ashley luke';
      }
      if (!answered.has('outcome')) {
        answered.add('outcome');
        return 'I want to protect my assets and keep as much of my money as possible';
      }
      return 'No additional details right now.';
    };

    let reachedSubmitReady = false;
    let reachedPaymentTerminal = false;
    const MAX_INTAKE_TURNS = 12;
    for (let index = 0; index < MAX_INTAKE_TURNS; index += 1) {
      const submitVisibleBefore = await submitNowButton.isVisible().catch(() => false);
      const buildVisibleBefore = await buildBriefButton.isVisible().catch(() => false);
      const paymentPromptVisibleBefore = await anonPage
        .locator('button')
        .filter({ hasText: /^(continue|continue\s+to\s+payment|pay\s*(?:&|and)\s*submit)$/i })
        .isVisible()
        .catch(() => false);
      const bodyTextBefore = await bodyLocator.innerText().catch(() => '');
      const readyPromptBefore = /ready to submit your case|are you ready to submit|submit your case to the firm/i.test(bodyTextBefore);
      if (submitVisibleBefore || paymentPromptVisibleBefore || readyPromptBefore) {
        reachedSubmitReady = true;
        if (paymentPromptVisibleBefore) reachedPaymentTerminal = true;
        break;
      }

      const promptText = await getLatestAiPromptText();
      const answer = pickAnswerForPrompt(promptText);
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
      const buildVisible = await buildBriefButton.isVisible().catch(() => false);
      const paymentPromptVisible = await anonPage
        .locator('button')
        .filter({ hasText: /^(continue|continue\s+to\s+payment|pay\s*(?:&|and)\s*submit)$/i })
        .isVisible()
        .catch(() => false);
      const bodyText = await bodyLocator.innerText().catch(() => '');
      const readyPrompt = /ready to submit your case|are you ready to submit|submit your case to the firm/i.test(bodyText);
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
      .filter({ hasText: /^(submit request|continue|continue\s+to\s+payment|pay\s*(?:&|and)\s*submit)$/i })
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
        settingsStatus: settingsResponse?.status() ?? null,
        settingsUrl: settingsResponse?.url() ?? null,
        submitStatus: submitIntakeResponse?.status() ?? null,
        submitUrl: submitIntakeResponse?.url() ?? null,
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

    await expect(
      anonPage.locator('body'),
      'Expected payment prompt to mention that a consultation fee is required.'
    ).toContainText(/consultation fee is required to proceed/i, { timeout: 10000 });

    const paymentPromptActionButton = anonPage
      .locator('button:visible')
      .filter({ hasText: /^(pay\s*(?:&|and)\s*submit|continue\s+to\s+payment)$/i })
      .first();

    await expect(
      paymentPromptActionButton,
      'Expected the payment prompt CTA to render after the fee summary message.'
    ).toBeVisible({ timeout: 10000 });
    const paymentPopupPromise = anonPage.waitForEvent('popup', { timeout: 20000 }).catch(() => null);
    await paymentPromptActionButton.click();

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
      submitIntakeResponse,
      'Expected submit-intake response to be captured after payment/submit action.'
    ).not.toBeNull();

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
      const paymentPopup = await paymentPopupPromise;
      if (paymentPopup) {
        await paymentPopup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined);
      }
      await expect
        .poll(
          async () => {
            const currentUrl = paymentPopup?.url() || anonPage.url();
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
    const authEmail = `lead-e2e-empty+${uniqueId}@example.com`;
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
    const authEmail = `planner-e2e+${uniqueId}@example.com`;
    const plannerNetworkLogPath = resolve(
      process.cwd(),
      '.tmp',
      'playwright',
      'public',
      'planner-network-log.json'
    );

    type DonePayload = {
      intakeFields?: Record<string, unknown> | null;
      actions?: Array<Record<string, unknown>> | null;
      persistedMessageId?: string | null;
      replySource?: 'model' | 'synthetic' | 'empty';
    };

    const parseDonePayloads = (text: string) => {
      const payloads: DonePayload[] = [];
      const lines = text.split('\n').filter((line) => line.trim().startsWith('data: '));
      for (const line of lines) {
        try {
          const payload = JSON.parse(line.replace(/^data:\s*/, ''));
          if (payload?.done === true) {
            payloads.push(payload);
          }
        } catch {
          // Skip malformed SSE payload lines.
        }
      }
      return payloads;
    };

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
      const consultationCta = anonPage.locator('button:visible').filter({ hasText: /request consultation/i }).first();
      const messageInput = anonPage.locator('[data-testid="message-input"]:visible').first();

      try {
        await expect.poll(
          async () => ({
            ctaVisible: await consultationCta.isVisible().catch(() => false),
            composerVisible: await messageInput.isVisible().catch(() => false),
          }),
          { timeout: 20_000, message: 'Expected widget home CTA or composer to render' }
        ).not.toEqual({ ctaVisible: false, composerVisible: false });
      } catch (error) {
        const startupDebug = await anonPage.evaluate(() => {
          const bodyText = document.body?.innerText ?? '';
          const buttons = Array.from(document.querySelectorAll('button'))
            .map((el) => (el.textContent ?? '').trim())
            .filter(Boolean)
            .slice(0, 40);
          return {
            url: window.location.href,
            title: document.title,
            bodySnippet: bodyText.slice(0, 3000),
            buttons,
          };
        }).catch(() => null);
        await testInfo.attach('planner-startup-debug.json', {
          body: JSON.stringify({
            startupDebug,
            networkLog,
          }, null, 2),
          contentType: 'application/json',
        });
        throw error;
      }

      if (await consultationCta.isVisible().catch(() => false)) {
        await consultationCta.click();
      }

      const slimFormName = anonPage.locator('input[placeholder*="full name" i]:visible').first();
      const slimFormEmail = anonPage.locator('input[type="email"]:visible').first();
      const slimFormPhone = anonPage.locator('input[type="tel"]:visible').first();
      const slimFormContinue = anonPage.locator('button:visible').filter({ hasText: /^continue$/i }).first();

      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (await messageInput.isEnabled({ timeout: 250 }).catch(() => false)) break;
        if (await slimFormContinue.isVisible({ timeout: 250 }).catch(() => false)) {
          if (await slimFormName.isVisible({ timeout: 250 }).catch(() => false)) {
            await slimFormName.fill(authName).catch(() => undefined);
          }
          if (await slimFormEmail.isVisible({ timeout: 250 }).catch(() => false)) {
            await slimFormEmail.fill(authEmail).catch(() => undefined);
          }
          if (await slimFormPhone.isVisible({ timeout: 250 }).catch(() => false)) {
            await slimFormPhone.fill('5555550123').catch(() => undefined);
          }
          await slimFormContinue.click().catch(() => undefined);
        }
        await anonPage.waitForTimeout(400);
      }

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
        console.log('DEBUG: Raw response text:', responseText);
        const donePayload = parseDonePayloads(responseText).at(-1) ?? null;
        console.log('DEBUG: Parsed done payload:', JSON.stringify(donePayload, null, 2));
        if (donePayload) {
          latestDonePayload = donePayload;
        }
        await expect.poll(
          async () => {
            const [sig, streamCount] = await Promise.all([
              aiLocator.evaluateAll((els) => JSON.stringify(els.map((el) => (el.textContent ?? '').trim()))),
              streamingLocator.count(),
            ]);
            console.log('DEBUG: UI settle check - signature before:', signatureBefore);
            console.log('DEBUG: UI settle check - signature now:', sig);
            console.log('DEBUG: UI settle check - stream count:', streamCount);
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

      expect(
        /city|state|location|where/i.test(reply1),
        `After description, AI should ask about location. Got: "${reply1.slice(0, 300)}"`
      ).toBe(true);

      // ASSERTION 1: Tool should be called when sufficient info provided
      
      expect(done1, 'Expected a done payload with intake fields after Turn 1.').not.toBeNull();
      expect(done1?.intakeFields, 'Expected intakeFields in Turn 1 response.').toBeDefined();
      expect(done1?.intakeFields?.description, 'Expected extracted description in Turn 1 fields.').toBeTruthy();

      const submitNowButton = anonPage.getByRole('button', { name: /submit request/i });
      const paymentButton = anonPage.locator('button:visible').filter({ hasText: /^(continue|continue\s+to\s+payment|pay\s*(?:&|and)\s*submit)$/i }).first();

      const { reply: reply2, donePayload: done2 } = await sendAndAwait('Raleigh, NC');
      await testInfo.attach('planner-turn2-reply.txt', { body: reply2, contentType: 'text/plain' });

      const submitAfterTurn2 = await submitNowButton.isVisible().catch(() => false);
      const paymentAfterTurn2 = await paymentButton.isVisible().catch(() => false);
      const paymentPromptAfterTurn2 = /payment|consultation fee|fee|submit/i.test(reply2);
      const validAfterLocation =
        /landlord|other party|opposing|who|party/i.test(reply2) ||
        /urgent|how urgent|routine|time.sensitive|emergency/i.test(reply2) ||
        /payment|fee|continue|submit/i.test(reply2) ||
        submitAfterTurn2 ||
        paymentAfterTurn2;

      // ASSERTION 2: Tool called with location and no contact info requested
      
      expect(done2?.intakeFields?.city, 'city should be extracted after turn 2').toBeTruthy();
      expect(done2?.intakeFields?.state, 'state should be extracted after turn 2').toBeTruthy();
      
      // If tool wasn't called on turn 1, it should be called by turn 2 with description + location
      if (!done1?.intakeFields?.description) {
        expect(
          done2?.intakeFields?.description,
          'description should be extracted by turn 2 if not extracted on turn 1'
        ).toBeTruthy();
      }
      
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

      // ASSERTION 2b: Verify normalization layer prevents tool-only responses
      // Verify the model produced a terminal action turn when actions are present.
      if (done2?.actions && done2.actions.length > 0) {
        expect(
          done2?.replySource !== 'empty',
          'Normalization layer should prevent empty replies when actions exist'
        ).toBe(true);
      }

      // Log observability data for model behavior analysis
      if (done2?.replySource === 'synthetic') {
        console.log('Model produced tool-only response, synthetic reply applied:', {
          replyLength: reply2.length,
          actionCount: done2?.actions?.length || 0,
        });
      }

      let reachedTerminalAfterTurn3 = paymentAfterTurn2 || submitAfterTurn2 || paymentPromptAfterTurn2;

      if (!reachedTerminalAfterTurn3) {
        const { reply: reply3, donePayload: done3 } = await sendAndAwait('My landlord, Johnson Properties LLC');
        await testInfo.attach('planner-turn3-reply.txt', { body: reply3, contentType: 'text/plain' });
        
        // ASSERTION 3: Tool called with opposing party and single question
        expect(done3?.intakeFields?.opposingParty, 'opposingParty should be extracted after turn 3').toBeTruthy();
        
        // Verify the third turn still produces a terminal action response when applicable.
        if (done3?.actions && done3.actions.length > 0) {
          expect(done3?.replySource !== 'empty', 'Tool/action turns should not collapse to an empty reply').toBe(true);
        }
        
        // Log observability data for turn 3
        if (done3?.replySource) {
          console.log('Turn 3 model behavior:', {
            replySource: done3.replySource,
            replyLength: reply3.length,
            actionCount: done3?.actions?.length || 0,
          });
        }
        
        // Verify model asked exactly one question (not multiple)
        const questionMarkCount = (reply3.match(/\?/g) || []).length;
        expect(
          questionMarkCount,
          `Model should ask exactly one question, not multiple. Found ${questionMarkCount} question marks in: "${reply3.slice(0, 300)}"`
        ).toBe(1);
        
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
        /^(continue|continue\s+to\s+payment|pay\s*(?:&|and)\s*submit)$/i.test(b)
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
          await anonPage.waitForTimeout(2_000);
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

        const count = await aiLocator.count();
        if (count === 0) { await anonPage.waitForTimeout(1000); continue; }
        const last = (await aiLocator.nth(count - 1).innerText().catch(() => '')).trim();

        if (/ready to submit|are you ready|consultation fee|continue to payment|submit your case/i.test(last)) {
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
      if (finalDone?.replySource) {
        console.log('Final turn model behavior summary:', {
          replySource: finalDone.replySource,
          actionCount: finalDone?.actions?.length || 0,
          intakeReady: finalDone?.intakeFields?.intakeReady
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
        finalDone?.intakeFields?.intakeReady === true ||
        finalActions.some((action) => action?.type === 'submit' || action?.type === 'continue_payment' || action?.type === 'open_url') ||
        finalActions.some((action) => /routine|time.sensitive|emergency/i.test(String(action?.label ?? ''))) ||
        /consultation fee|continue to payment|submit your intake|submit your case/i.test(finalRenderedText);
      expect(
        reachedValidTerminalState,
        'final state should either mark intakeReady or expose the payment/urgency terminal state'
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
});
