import { expect, test } from './fixtures';
import { randomUUID } from 'crypto';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();
const DEFAULT_PRACTICE_SLUG = process.env.E2E_PRACTICE_SLUG ?? process.env.E2E_WIDGET_SLUG ?? e2eConfig?.practice.slug ?? 'paul-yahoo';
const MAX_AI_RESPONSE_MS = Number(process.env.E2E_WIDGET_AI_RESPONSE_BUDGET_MS ?? 30000);
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

    anonPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    anonPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await anonPage.goto(`/public/${encodeURIComponent(practiceSlug)}?v=widget`, { waitUntil: 'domcontentloaded' });

    const messageInput = anonPage.getByTestId('message-input');
    const consultationCta = anonPage.getByRole('button', { name: /request consultation/i }).first();
    await consultationCta.click();

    const slimFormName = anonPage.getByLabel('Name');
    const slimFormEmail = anonPage.getByLabel('Email');
    const slimFormPhone = anonPage.getByLabel('Phone');
    const slimFormContinue = anonPage.getByRole('button', { name: /continue/i }).first();
    const uniqueId = randomUUID().slice(0, 8);
    await expect
      .poll(
        async () => {
          const [nameVisible, inputVisible] = await Promise.all([
            slimFormName.isVisible().catch(() => false),
            messageInput.isVisible().catch(() => false),
          ]);
          return { nameVisible, inputVisible };
        },
        {
          timeout: 10000,
          message: 'Expected slim consultation form or chat composer to appear after Request Consultation.',
        }
      )
      .not.toEqual({ nameVisible: false, inputVisible: false });
    const slimFormVisible = await slimFormName.isVisible().catch(() => false);
    if (slimFormVisible) {
      await expect(slimFormName).toBeEditable({ timeout: 5000 });
      await slimFormName.fill(`Lead E2E ${uniqueId}`);
      await slimFormEmail.fill(`lead-e2e+${uniqueId}@example.com`);
      await slimFormPhone.fill('555-555-1212');
      await slimFormContinue.click();
    }

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
    try {
      await expect(messageInput).toBeEnabled({ timeout: 45000 });
    } catch (error) {
      const entryDebug = await captureLeadFlowState();
      console.log('[lead-flow] Entry debug:', JSON.stringify(entryDebug, null, 2));
      await testInfo.attach('lead-flow-entry-debug.json', {
        body: JSON.stringify(entryDebug, null, 2),
        contentType: 'application/json',
      });
      throw error;
    }
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
      let aiStep;
      try {
        aiStep = await sendAndAwaitAi(answer);
      } catch (error) {
        const debug = await captureLeadFlowState();
        await testInfo.attach(`lead-flow-step-${index + 1}-debug.json`, {
          body: JSON.stringify({ step: index + 1, promptText, answer, debug, aiTranscript }, null, 2),
          contentType: 'application/json',
        });
        console.log('[lead-flow] Step failure:', JSON.stringify({ step: index + 1, promptText, answer, debug, aiTranscript }, null, 2));
        throw error;
      }
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
      const debug = await captureLeadFlowState();
      await testInfo.attach('lead-flow-cta-debug.json', {
        body: JSON.stringify(debug, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach('lead-flow-ai-transcript.json', {
        body: JSON.stringify(aiTranscript, null, 2),
        contentType: 'application/json',
      });
      console.log('[lead-flow] CTA debug:', JSON.stringify(debug, null, 2));
      console.log('[lead-flow] AI transcript:', JSON.stringify(aiTranscript, null, 2));
      throw new Error('Intake did not reach a submit-ready CTA state after scripted intake answers.');
    }

    await expect(submitNowButton).toBeVisible({ timeout: 10000 });
    const buildBriefVisibleAtSubmit = await buildBriefButton.isVisible().catch(() => false);
    if (!buildBriefVisibleAtSubmit) {
      console.log('[lead-flow] Build stronger brief CTA not visible in this run (submit CTA present).');
    }

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
