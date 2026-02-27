import { expect, test } from './fixtures';
import { randomUUID } from 'crypto';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForSession } from './helpers/auth';

const e2eConfig = loadE2EConfig();
const DEFAULT_PRACTICE_SLUG = process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';
const rawBudget = process.env.E2E_WIDGET_AI_RESPONSE_BUDGET_MS;
const parsedBudget = rawBudget ? parseInt(rawBudget, 10) : 30000;
const MAX_AI_RESPONSE_MS = Number.isFinite(parsedBudget) ? parsedBudget : 30000;
const LEAD_TURN_TIMEOUT_MS = MAX_AI_RESPONSE_MS;

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
  test.describe.configure({ timeout: 120000 });

  test('public intake reaches submit CTA and submit button advances flow', async ({
    anonPage,
  }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const submitIntakeStatuses: number[] = [];

    anonPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    anonPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    anonPage.on('response', (response) => {
      if (
        response.request().method() === 'POST' &&
        response.url().includes('/api/conversations/') &&
        response.url().includes('/submit-intake')
      ) {
        submitIntakeStatuses.push(response.status());
      }
    });

    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`, { waitUntil: 'domcontentloaded' });

    const messageInput = anonPage.locator('[data-testid="message-input"]:visible').first();
    const consultationCta = anonPage.locator('button:visible').filter({ hasText: /request consultation/i }).first();
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
    if (await consultationCta.isVisible().catch(() => false)) {
      await consultationCta.click();
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

    const pickAnswerForPrompt = (rawPrompt: string): string => {
      const prompt = rawPrompt.toLowerCase();
      if (/ready to submit|submit your request|continue now/.test(prompt)) return 'Submit request';
      if (/legal situation|what'?s going on|describe what'?s going on|tell me a bit/.test(prompt)) {
        answered.add('situation');
        return defaultSituation;
      }
      if (/city and state|what city|where.*(located|live)|what state/.test(prompt)) {
        answered.add('location');
        return 'durham nc';
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
        return 'I want to protect my assets and keep as much of my money as possible';
      }
      if (/documents|paperwork|files/.test(prompt)) {
        answered.add('documents');
        return 'not yet';
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
    const MAX_INTAKE_TURNS = 12;
    for (let index = 0; index < MAX_INTAKE_TURNS; index += 1) {
      const submitVisibleBefore = await submitNowButton.isVisible().catch(() => false);
      const buildVisibleBefore = await buildBriefButton.isVisible().catch(() => false);
      const bodyTextBefore = await bodyLocator.innerText().catch(() => '');
      const readyPromptBefore = /ready to submit|submit your request|would you like to continue now/i.test(bodyTextBefore);
      if (submitVisibleBefore || (buildVisibleBefore && readyPromptBefore)) {
        reachedSubmitReady = true;
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
      const bodyText = await bodyLocator.innerText().catch(() => '');
      const readyPrompt = /ready to submit|submit your request|would you like to continue now/i.test(bodyText);
      if (submitVisible || (buildVisible && readyPrompt)) {
        reachedSubmitReady = true;
        break;
      }
    }

    if (!reachedSubmitReady) {
      throw new Error(
        `Intake did not reach a submit-ready CTA state after scripted intake answers.\n` +
        `Recent AI transcript: ${JSON.stringify(aiTranscript.slice(-4))}`
      );
    }

    await expect(submitNowButton).toBeVisible({ timeout: 10000 });
    await submitNowButton.click();

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
        response.url().includes('/link?practiceId='),
      { timeout: 20000 }
    ).catch(() => null);

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
    if (conversationLinkResponse) {
      expect(
        conversationLinkResponse.status(),
        `Conversation link after auth failed (expected non-403/200).\nURL: ${conversationLinkResponse.url()}`
      ).toBeLessThan(400);
    }

    const submitIntakeResponse = await submitIntakeResponsePromise;
    const submitIntakeText = await submitIntakeResponse.text().catch(() => '');
    let submitIntakePayload: { success?: boolean; data?: { intake_uuid?: string; status?: string; payment_link_url?: string | null } } | null = null;
    try {
      submitIntakePayload = submitIntakeText ? JSON.parse(submitIntakeText) : null;
    } catch {
      submitIntakePayload = null;
    }

    expect(
      submitIntakeResponse.status(),
      `submit-intake failed after auth.\nStatus: ${submitIntakeResponse.status()}\nBody: ${submitIntakeText.slice(0, 500)}`
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
      `submit-intake should fire exactly once after auth. Observed statuses: ${JSON.stringify(submitIntakeStatuses)}`
    ).toBe(1);

    if (consoleErrors.length) {
      await testInfo.attach('console-errors', { body: consoleErrors.join('\n'), contentType: 'text/plain' });
    }
    if (pageErrors.length) {
      await testInfo.attach('page-errors', { body: pageErrors.join('\n'), contentType: 'text/plain' });
    }

    expect(
      pageErrors.filter((e) => !e.includes('Chat connection closed')),
      `Unexpected page errors:\n${pageErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
