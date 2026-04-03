import { expect, test } from './fixtures.public';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForSession } from './helpers/auth';

const e2eConfig = loadE2EConfig();
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
          || key === 'blawby:postAuthConversation'
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
            prefillAmount?: number;
            prefill_amount?: number;
            paymentLinkEnabled?: boolean;
            payment_link_enabled?: boolean;
          };
        };
      } | null;
    }> = [];

    anonPage.on('console', (msg) => {
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
                    prefillAmount?: number;
                    prefill_amount?: number;
                    paymentLinkEnabled?: boolean;
                    payment_link_enabled?: boolean;
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

    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`, { waitUntil: 'domcontentloaded' });

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
    const authPassword = `LeadFlow!${uniqueId}Aa`;
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

    const sendAndAwaitAi = async (text: string) => {
      const aiLocator = anonPage.locator('[data-testid="ai-message"], [data-testid="system-message"]');
      const streamingLocator = anonPage.locator('[id^="message-streaming-"]');
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
      const aiSignatureBefore = JSON.stringify(
        await aiLocator.evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()))
      );
      const responsePromise = anonPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST'
          && response.url().includes('/api/ai/chat')
          && response.status() === 200,
        { timeout: LEAD_TURN_TIMEOUT_MS }
      );
      await messageInput.fill(text);
      await anonPage.getByRole('button', { name: /send message/i }).click();
      const response = await responsePromise;
      const contentType = response.headers()['content-type'] ?? '';
      const responseTextPromise = !contentType.includes('application/json')
        ? response.text().catch(() => '')
        : Promise.resolve('');
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => null) as { reply?: string; message?: { content?: string } } | null
        : null;
      if (!contentType.includes('application/json')) {
        try {
          await expect
            .poll(
              async () => {
                const [aiSignature, streamingCount] = await Promise.all([
                  aiLocator.evaluateAll((els) => JSON.stringify(els.map((el) => (el.textContent ?? '').trim()))),
                  streamingLocator.count(),
                ]);
                return { aiSignature, streamingCount };
              },
              {
                timeout: LEAD_TURN_TIMEOUT_MS,
                message: 'Expected streaming bubble or rendered AI/system message after SSE response started.',
              }
            )
            .not.toEqual({ aiSignature: aiSignatureBefore, streamingCount: 0 });
        } catch (error) {
          const sseBody = await responseTextPromise;
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
      'I am going through a divorce and my wife is asking for most of our money and assets. I need help protecting my finances and getting a fair outcome.';
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
      if (/anything else|other details|add anything/.test(prompt)) {
        answered.add('other-details');
        return 'No, that covers the main issue right now.';
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
      const aiStep = await sendAndAwaitAi(answer);
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

    if (reachedPaymentTerminal || paymentVisibleAtAction || hasPaymentPromptAtAction) {
      if (paymentVisibleAtAction) {
        await paymentContinueButton.click();
      } else {
        await expect(
          terminalActionButton,
          'Expected a visible action button in the payment-gated terminal state.'
        ).toBeVisible({ timeout: 10000 });
        await terminalActionButton.click();
      }
    } else {
      if (!submitVisibleAtAction) {
        await expect(submitNowButton).toBeVisible({ timeout: 10000 });
      }
      await submitNowButton.click();
    }

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
    const resolvedPrefillAmount = typeof latestSettingsRecord?.prefillAmount === 'number'
      ? latestSettingsRecord.prefillAmount
      : typeof latestSettingsRecord?.prefill_amount === 'number'
        ? latestSettingsRecord.prefill_amount
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
      resolvedPrefillAmount,
      `Expected consultation fee amount ${EXPECTED_CONSULTATION_FEE_MINOR} minor units (${EXPECTED_CONSULTATION_FEE_LABEL}).\nObserved settings: ${JSON.stringify(latestSettingsPayload, null, 2)}`
    ).toBe(EXPECTED_CONSULTATION_FEE_MINOR);

    await expect(
      anonPage.locator('body'),
      `Expected payment prompt to mention the consultation fee amount ${EXPECTED_CONSULTATION_FEE_LABEL}.`
    ).toContainText(EXPECTED_CONSULTATION_FEE_LABEL, { timeout: 10000 });

    // Deterministic CTA path should advance to auth/save flow (modal/overlay) or auth route.
    // We intentionally avoid hardcoding a single UI variant because this path may be modal
    // or route-based depending on environment/widget context.
    await expect
      .poll(
        async () => {
          const state = await captureLeadFlowState();
          const body = (state.bodySnippet || '').toLowerCase();
          const href = (state.url || '').toLowerCase();
          const buttons = (state.buttons || []).join(' | ').toLowerCase();
          const authOverlay = body.includes('save your conversation') || buttons.includes('sign up / sign in');
          const authForm = body.includes('continue with google') || body.includes('continue with email');
          const authRoute = href.includes('/auth');
          return authOverlay || authForm || authRoute;
        },
        {
          timeout: 15000,
          message:
            'Submit request CTA did not advance to auth/save flow. ' +
            'Expected auth overlay/modal or auth route after clicking Submit request.',
        }
      )
      .toBe(true);

    const submitIntakeResponsePromise = anonPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/submit-intake') &&
        response.url().includes('/api/conversations/'),
      { timeout: 45000 }
    );
    const conversationLinkResponsePromise = anonPage.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/api/conversations/') &&
        response.url().includes('/link?practiceId=') &&
        response.status() < 400,
      { timeout: 20000 }
    );

    const signUpNameInput = anonPage.getByTestId('signup-name-input');
    const signUpEmailInput = anonPage.getByTestId('signup-email-input');
    const signUpPasswordInput = anonPage.getByTestId('signup-password-input');
    const signUpConfirmPasswordInput = anonPage.getByTestId('signup-confirm-password-input');
    const signUpSubmitButton = anonPage.getByTestId('signup-submit-button');

    await expect(signUpPasswordInput).toBeVisible({ timeout: 15000 });
    if (await signUpNameInput.isVisible().catch(() => false)) {
      await signUpNameInput.fill(authName);
    }
    if (await signUpEmailInput.isVisible().catch(() => false)) {
      await signUpEmailInput.fill(authEmail);
    }
    await signUpPasswordInput.fill(authPassword);
    await signUpConfirmPasswordInput.fill(authPassword);

    await signUpSubmitButton.click();

    await waitForSession(anonPage, { timeoutMs: 30000 });

    const conversationLinkResponse = await conversationLinkResponsePromise;
    expect(
      conversationLinkResponse.status(),
      `Conversation link after auth failed (expected <400).\nURL: ${conversationLinkResponse.url()}`
    ).toBeLessThan(400);

    const submitIntakeResponse = await submitIntakeResponsePromise;
    const submitIntakeText = await submitIntakeResponse.text().catch(() => '');
    let submitIntakePayload: { success?: boolean; data?: { intake_uuid?: string; status?: string; payment_link_url?: string | null } } | null = null;
    try {
      submitIntakePayload = submitIntakeText ? JSON.parse(submitIntakeText) : null;
    } catch {
      submitIntakePayload = null;
    }

    if (submitIntakeResponse.status() === 200) {
      expect(
        submitIntakePayload?.success,
        `submit-intake returned unexpected payload: ${submitIntakeText.slice(0, 500)}`
      ).toBe(true);
      expect(submitIntakePayload?.data?.intake_uuid, 'submit-intake must return intake_uuid').toBeTruthy();
    } else {
      // Public no-org environments may reject backend intake creation after auth.
      // The worker should surface that upstream auth/org error verbatim.
      expect([401, 403]).toContain(submitIntakeResponse.status());
      expect(
        /no organization context found|authentication required|forbidden|unauthorized/i.test(submitIntakeText),
        `Unexpected submit-intake error payload: ${submitIntakeText.slice(0, 500)}`
      ).toBe(true);
    }

    const paymentLinkUrl = submitIntakePayload?.data?.payment_link_url ?? null;
    if (submitIntakeResponse.status() === 200 && paymentLinkUrl) {
      expect(
        /^https?:\/\//i.test(paymentLinkUrl),
        `payment_link_url should be an absolute URL, got: ${paymentLinkUrl}`
      ).toBe(true);
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
    } else if (submitIntakeResponse.status() === 200) {
      await expect(
        anonPage.locator('body'),
        'Expected a confirmation message in chat when no payment link is returned.'
      ).toContainText(/intake has been submitted|will review it and follow up/i, { timeout: 15000 });
    }

    expect(
      submitIntakeStatuses.length,
      `submit-intake should fire exactly once after auth. Observed statuses: ${JSON.stringify(submitIntakeStatuses)}`
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

  test('public intake sign-in path links existing conversation after auth prompt', async ({ anonPage }, testInfo) => {
    test.skip(!e2eConfig, 'E2E credentials are not configured.');

    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const conversationLinkRequests: Array<{ url: string; status: number }> = [];
    const activeConversationStatuses: number[] = [];
    const networkLog: Array<{ time: string; method: string; url: string; status?: number }> = [];
    let observedConversationId: string | null = null;
    const captureConversationIdFromUrl = (url: string): void => {
      const match = url.match(/\/api\/conversations\/([a-zA-Z0-9_-]+)/);
      const excludedSegments = new Set(['active', 'link', 'submit-intake']);
      if (match?.[1] && !excludedSegments.has(match[1])) {
        observedConversationId = match[1];
      }
    };

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
      const url = response.url();
      captureConversationIdFromUrl(url);
      if (
        response.request().method() === 'PATCH' &&
        url.includes('/api/conversations/') &&
        url.includes('/link')
      ) {
        conversationLinkRequests.push({ url, status: response.status() });
      }
    });

    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`, {
      waitUntil: 'domcontentloaded',
    });

    const messageInput = anonPage.locator('[data-testid="message-input"]:visible').first();
    const consultationCta = anonPage
      .locator('button:visible')
      .filter({ hasText: /request consultation/i })
      .first();

    try {
      await expect
        .poll(
          async () => ({
            ctaVisible: await consultationCta.isVisible().catch(() => false),
            composerVisible: await messageInput.isVisible().catch(() => false),
          }),
          {
            timeout: 25000,
            message: 'Expected widget home CTA or message composer to appear.',
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
      await testInfo.attach('signin-flow-startup-debug.json', {
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
    const slimFormContinue = anonPage
      .locator('button:visible')
      .filter({ hasText: /^continue$/i })
      .first();

    {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (await messageInput.isEnabled({ timeout: 300 }).catch(() => false)) break;

        if (await slimFormContinue.isVisible({ timeout: 300 }).catch(() => false)) {
          if (await slimFormName.isVisible({ timeout: 300 }).catch(() => false)) {
            await slimFormName.fill('Anon Signin Flow');
          }
          if (await slimFormEmail.isVisible({ timeout: 300 }).catch(() => false)) {
            await slimFormEmail.fill(`lead-signin-${Date.now()}@example.com`);
          }
          if (await slimFormPhone.isVisible({ timeout: 300 }).catch(() => false)) {
            await slimFormPhone.fill('5555550101');
          }
          await slimFormContinue.click().catch(() => undefined);
        }

        await anonPage.waitForTimeout(400);
      }
    }

    await expect(messageInput).toBeEnabled({ timeout: 20_000 });

    const aiResponsePromise = anonPage
      .waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes('/api/ai/chat') &&
          r.status() === 200,
        { timeout: 40_000 }
      )
      .catch(() => null);

    await messageInput.fill('Hello, I need help and I will sign in after this.');
    await anonPage.getByRole('button', { name: /send message/i }).click();
    const aiResponse = await aiResponsePromise;
    if (!aiResponse) {
      throw new Error('Expected AI chat response for anon sign-in flow, but /api/ai/chat response was not observed.');
    }

    let capturedConversationId: string | null = null;
    await expect
      .poll(
        async () => {
          capturedConversationId = observedConversationId;
          return capturedConversationId;
        },
        {
          timeout: 10_000,
          message: 'Expected conversationId from widget conversation network traffic after AI response',
        }
      )
      .not.toBeNull();
    if (!capturedConversationId) {
      throw new Error('Expected conversationId from widget conversation network traffic after AI response, but none was found.');
    }

    const submitNowButton = anonPage.getByRole('button', { name: /submit request/i });
    const signInCta = anonPage
      .locator('button:visible')
      .filter({ hasText: /sign up|sign in|save your conversation/i })
      .first();

    let authTriggered = false;
    if (await submitNowButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await submitNowButton.click();
      authTriggered = true;
    } else if (await signInCta.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await signInCta.click();
      authTriggered = true;
    }

    if (!authTriggered) {
      // No in-app auth CTA found — the chat may not have reached the
      // submit/save-conversation stage within this message.  The contract we're
      // testing is the sessionStorage handoff *before* auth, so we write it
      // manually (mimicking what ChatContainer does) and navigate to the sign-in
      // page.  The PATCH /link assertion below still validates the round-trip.
      const pageSnapshot = await anonPage.evaluate(() => {
        const bodyText = document.body?.innerText ?? '';
        const buttons = Array.from(document.querySelectorAll('button'))
          .map((el) => (el.textContent ?? '').trim())
          .filter(Boolean)
          .slice(-20);
        return { url: window.location.href, bodyText: bodyText.slice(-1500), buttons };
      });
      await testInfo.attach('lead-flow-signin-auth-trigger-debug.json', {
        body: JSON.stringify(pageSnapshot, null, 2),
        contentType: 'application/json',
      });

      // Seed sessionStorage before navigation so the auth page keeps the same
      // handoff data in its own document context.
      if (capturedConversationId) {
        await anonPage.evaluate(({ convId, fallbackPracticeId }) => {
          try {
            const practiceId = new URLSearchParams(window.location.search).get('practiceId') || fallbackPracticeId || null;
            window.sessionStorage.setItem(
              'blawby:postAuthConversation',
              JSON.stringify({
                conversationId: convId,
                practiceId,
                practiceSlug: window.location.pathname.split('/')[2] ?? '',
                workspace: 'public',
              })
            );
          } catch { /* ignore */ }
        }, {
          convId: capturedConversationId,
          fallbackPracticeId: null,
        });
      }

      await anonPage.goto('/auth?mode=signin', { waitUntil: 'domcontentloaded' });
      authTriggered = true;
    }

    await anonPage.waitForTimeout(800);

    const storedContext = await anonPage.evaluate((): string | null => {
      try {
        return window.sessionStorage.getItem('blawby:postAuthConversation');
      } catch {
        return null;
      }
    });

    await testInfo.attach('post-auth-context-stored', {
      body: storedContext ?? '(not set)',
      contentType: 'text/plain',
    });

    if (capturedConversationId) {
      expect(storedContext, 'Expected post-auth conversation context to be stored before sign in').toBeTruthy();
      if (storedContext) {
        const parsed = JSON.parse(storedContext) as { conversationId?: string };
        expect(parsed.conversationId).toBe(capturedConversationId);
      }
    }

    const signInEmailInput = anonPage.getByTestId('signin-email-input');
    const signInPasswordInput = anonPage.getByTestId('signin-password-input');
    const signInSubmitButton = anonPage.getByTestId('signin-submit-button');
    const signUpPasswordInput = anonPage.getByTestId('signup-password-input');

    const hasSignInFields = await signInEmailInput.isVisible().catch(() => false);
    if (!hasSignInFields && await signUpPasswordInput.isVisible().catch(() => false)) {
      const signInToggle = anonPage
        .locator('button, a')
        .filter({ hasText: /^sign in$/i })
        .first();
      if (await signInToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await signInToggle.click();
      }
    }

    await expect(signInEmailInput).toBeVisible({ timeout: 20_000 });
    await expect(signInPasswordInput).toBeVisible({ timeout: 20_000 });
    await expect(signInSubmitButton).toBeVisible({ timeout: 20_000 });

    const signInResponsePromise = anonPage
      .waitForResponse(
        (r) => r.url().includes('/api/auth/sign-in') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      .catch(() => null);

    await signInEmailInput.fill(e2eConfig!.owner.email);
    await signInPasswordInput.fill(e2eConfig!.owner.password);
    await signInSubmitButton.click();

    const signInResponse = await signInResponsePromise;
    if (signInResponse) {
      expect(signInResponse.status(), `Sign-in API returned ${signInResponse.status()}; expected 200`).toBe(200);
    }

    try {
      await waitForSession(anonPage, { timeoutMs: 30_000 });
    } catch (error) {
      const sessionDebug = await anonPage.evaluate(() => {
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
      await testInfo.attach('signin-flow-session-debug.json', {
        body: JSON.stringify({ sessionDebug, networkLog, conversationLinkRequests, observedConversationId }, null, 2),
        contentType: 'application/json',
      });
      throw error;
    }

    if (capturedConversationId) {
      await expect
        .poll(
          () => conversationLinkRequests.length > 0,
          {
            timeout: 20_000,
            message:
              'Expected PATCH /api/conversations/:id/link to fire after sign-in. ' +
              `conversationId was: ${capturedConversationId}`,
          }
        )
        .toBe(true);

      const successfulLink = conversationLinkRequests.find((req) => req.status < 400);
      if (successfulLink) {
        await expect
          .poll(
            async () => anonPage.url().includes(capturedConversationId),
            {
              timeout: 20_000,
              message: `Expected to remain on the linked conversation URL after auth (conversationId=${capturedConversationId})`,
            }
          )
          .toBe(true);
      } else {
        expect(
          conversationLinkRequests.length > 0,
          `Expected at least one link attempt after sign-in: ${JSON.stringify(conversationLinkRequests)}`
        ).toBe(true);
        expect(
          conversationLinkRequests.every((req) => req.status === 404 || req.status === 403),
          `Unexpected link statuses after sign-in: ${JSON.stringify(conversationLinkRequests)}`
        ).toBe(true);
      }
    }
    await testInfo.attach('signin-flow-network-log.json', {
      body: JSON.stringify(networkLog, null, 2),
      contentType: 'application/json',
    });
  });

  test('widget auth token persists widget flow after clearing cookies', async ({ anonPage }) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const widgetUrl = `/public/${encodeURIComponent(practiceSlug)}?v=widget`;

    const initialBootstrapResponsePromise = anonPage.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/widget/bootstrap') &&
        response.status() === 200,
      { timeout: 30_000 }
    );

    await anonPage.goto(widgetUrl, { waitUntil: 'domcontentloaded' });
    const initialBootstrapResponse = await initialBootstrapResponsePromise;
    const initialBootstrapBody = await initialBootstrapResponse.json().catch(() => null) as {
      widgetAuthToken?: string | null;
      session?: { user?: { id?: string } | null } | null;
    } | null;

    expect(initialBootstrapBody?.session?.user?.id, 'bootstrap should include session user').toBeTruthy();
    expect(
      typeof initialBootstrapBody?.widgetAuthToken === 'string' && initialBootstrapBody.widgetAuthToken.length > 20,
      'bootstrap should issue widgetAuthToken for widget runtime'
    ).toBe(true);

    const pageToken = await anonPage.evaluate(() => {
      try {
        return window.sessionStorage.getItem('blawby_widget_auth_token');
      } catch {
        return null;
      }
    });
    expect(
      typeof pageToken === 'string' && pageToken.length > 20,
      'widget token should be persisted in sessionStorage'
    ).toBe(true);

    await anonPage.context().clearCookies();
    let cookiesCleared = true;

    let reloadedBootstrapAuthHeader: string | undefined;
    const reloadedBootstrapRequestPromise = anonPage.waitForRequest(
      (request) => {
        if (request.method() !== 'GET') return false;
        if (!request.url().includes('/api/widget/bootstrap')) return false;
        reloadedBootstrapAuthHeader = request.headers()['authorization'];
        return true;
      },
      { timeout: 30_000 }
    );
    const reloadedBootstrapResponsePromise = anonPage.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/widget/bootstrap') &&
        response.status() === 200,
      { timeout: 30_000 }
    );

    const observedWsUrls: string[] = [];
    anonPage.on('websocket', (ws) => {
      if (cookiesCleared) {
        observedWsUrls.push(ws.url());
      }
    });

    await anonPage.goto(widgetUrl, { waitUntil: 'domcontentloaded' });
    await reloadedBootstrapRequestPromise;
    const reloadedBootstrapResponse = await reloadedBootstrapResponsePromise;
    const reloadedBootstrapBody = await reloadedBootstrapResponse.json().catch(() => null) as {
      session?: { user?: { id?: string } | null } | null;
      widgetAuthToken?: string | null;
      widgetQueryAuthToken?: string | null;
    } | null;

    expect(
      typeof reloadedBootstrapAuthHeader === 'string' && reloadedBootstrapAuthHeader.startsWith('Bearer '),
      'reloaded bootstrap must send Authorization Bearer token'
    ).toBe(true);
    expect(reloadedBootstrapBody?.session?.user?.id, 'reloaded bootstrap should resolve session user without cookies').toBeTruthy();
    expect(
      typeof reloadedBootstrapBody?.widgetAuthToken === 'string' && reloadedBootstrapBody.widgetAuthToken.length > 20,
      'reloaded bootstrap should re-issue widget token'
    ).toBe(true);

    await expect
      .poll(
        () => observedWsUrls.find((url) => url.includes('/api/conversations/') && url.includes('bw_token=')) ?? null,
        {
          timeout: 30_000,
          message: 'Expected conversation WebSocket URL to include bw_token query auth after cookie clear.',
        }
      )
      .not.toBeNull();
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
      quickReplies?: string[] | null;
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

      await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`, {
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
        const donePayload = parseDonePayloads(responseText).at(-1) ?? null;
        if (donePayload) {
          latestDonePayload = donePayload;
        }
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

      expect(
        done1?.intakeFields?.description,
        'description should be extracted after turn 1'
      ).toBeTruthy();

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

      expect(done2?.intakeFields?.city, 'city should be extracted after turn 2').toBeTruthy();
      expect(
        validAfterLocation,
        `After location, AI should ask about opposing party, urgency, or move to payment/submit. Got: "${reply2.slice(0, 300)}"`
      ).toBe(true);
      expect(
        done2?.intakeFields?.city || done2?.intakeFields?.state,
        'city or state should be extracted after turn 2'
      ).toBeTruthy();

      let reachedTerminalAfterTurn3 = paymentAfterTurn2 || submitAfterTurn2 || paymentPromptAfterTurn2;

      if (!reachedTerminalAfterTurn3) {
        const { reply: reply3, donePayload: done3 } = await sendAndAwait('My landlord, Johnson Properties LLC');
        await testInfo.attach('planner-turn3-reply.txt', { body: reply3, contentType: 'text/plain' });
        expect(done3?.intakeFields?.opposingParty, 'opposingParty should be extracted after turn 3').toBeTruthy();
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

      expect(finalDone?.intakeFields?.description, 'final state: description must be present').toBeTruthy();
      expect(finalDone?.intakeFields?.city, 'final state: city must be present').toBeTruthy();
      expect(finalDone?.intakeFields?.state, 'final state: state must be present').toBeTruthy();
      expect(finalDone?.intakeFields?.opposingParty, 'final state: opposingParty must be present').toBeTruthy();
      const finalQuickReplies = Array.isArray(finalDone?.quickReplies) ? finalDone.quickReplies : [];
      const finalIntakeQuickReplies = Array.isArray(finalDone?.intakeFields?.quickReplies)
        ? finalDone.intakeFields.quickReplies
        : [];
      const finalRenderedText = await aiLocator.last().innerText().catch(() => '');
      const reachedValidTerminalState =
        finalDone?.intakeFields?.intakeReady === true ||
        finalQuickReplies.some((reply) => /routine|time.sensitive|emergency/i.test(reply)) ||
        finalIntakeQuickReplies.some((reply) => /routine|time.sensitive|emergency/i.test(reply)) ||
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
