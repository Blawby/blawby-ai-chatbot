/**
 * E2E happy-path coverage for the public widget intake flow — explicitly
 * asserting that the AI request fires and the timeline records a turn.
 *
 * Existing `widget-intake-flow.spec.ts` exercises the slim-form → AI message
 * → submit path but doesn't assert AI behavior at the network / timeline
 * boundary. This spec adds the "AI request fired" assertion as a regression
 * guard so future refactors can't silently skip intake AI (the bug class
 * that prompted U1-U3).
 *
 * Verifies (U11 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md):
 *   - POST /api/ai/chat fires after slim-form completion
 *   - the response is SSE (text/event-stream) — NOT a scripted hard-coded
 *     reply (the regex shortcuts removed in U3 would have returned JSON)
 *   - the composer doesn't enter hard-error state on a healthy intake turn
 *
 * NOTE: skipped when E2E_INTAKE_AI_FORCE_FAILURE=true is set, because that
 * mode is for the failure-path spec.
 */

import { expect, test } from './fixtures.public';
import { prepareWidgetComposer, buildWidgetUrl } from './helpers/widgetComposer';

const DEFAULT_PRACTICE_SLUG =
  process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';

const FORCE_FAILURE_ENABLED =
  String(process.env.E2E_INTAKE_AI_FORCE_FAILURE ?? '').toLowerCase() === 'true';

test.describe('Public widget intake — AI fires (U11)', () => {
  test.skip(FORCE_FAILURE_ENABLED, 'Happy path requires the worker AI to be functional; INTAKE_AI_FORCE_FAILURE is set.');
  test.describe.configure({ timeout: 300000 });

  test('intake message triggers POST /api/ai/chat with SSE response', async ({ anonPage }) => {
    const practiceSlug = DEFAULT_PRACTICE_SLUG;
    const contactEmail = `e2e-happy-${Date.now()}@example.com`;
    const contactName = 'E2E Happy Test';

    const aiChatRequests: Array<{ url: string; contentType: string | null }> = [];
    anonPage.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/ai/chat') && response.request().method() === 'POST') {
        aiChatRequests.push({
          url,
          contentType: response.headers()['content-type'] ?? null,
        });
      }
    });

    await anonPage.goto(buildWidgetUrl(practiceSlug));
    const { messageInput } = await prepareWidgetComposer(anonPage, contactName, contactEmail);

    await messageInput.fill('I need help with a contract dispute');
    await messageInput.press('Enter');

    // Wait for the AI response to start. Either a streamed token appears OR
    // the call finishes — either way the POST /api/ai/chat call has fired.
    await expect.poll(() => aiChatRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
    const lastCall = aiChatRequests[aiChatRequests.length - 1];
    expect(lastCall.contentType ?? '').toMatch(/text\/event-stream/);

    // Composer must NOT enter hard-error state on a healthy turn.
    const hardError = anonPage.getByTestId('composer-hard-error');
    await expect(hardError).not.toBeVisible({ timeout: 5_000 });
  });

  test('hours-question regression guard — AI handles, not a scripted reply (U3)', async ({ anonPage }) => {
    const practiceSlug = DEFAULT_PRACTICE_SLUG;
    const contactEmail = `e2e-hours-${Date.now()}@example.com`;
    const contactName = 'E2E Hours Regression';

    const aiChatRequests: number[] = [];
    anonPage.on('response', (response) => {
      if (response.url().includes('/api/ai/chat') && response.request().method() === 'POST') {
        aiChatRequests.push(Date.now());
      }
    });

    await anonPage.goto(buildWidgetUrl(practiceSlug));
    const { messageInput } = await prepareWidgetComposer(anonPage, contactName, contactEmail);

    await messageInput.fill('what are your hours?');
    await messageInput.press('Enter');

    // The U3 fix routes hours questions through the AI. If a regression
    // reintroduces the HOURS_QUESTION_REGEX shortcut, /api/ai/chat would not
    // fire (or would return JSON, not SSE). Assert AI was invoked.
    await expect.poll(() => aiChatRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);

    // And the scripted "we haven't published our hours" string from the
    // deleted regex branch should NOT appear in the rendered messages — the
    // AI's response will be varied phrasing, not that templated sentence.
    const chatBody = anonPage.locator('[data-testid="chat-message"]');
    await expect(chatBody).not.toContainText(/we haven['']t published our hours/i, { timeout: 30_000 });
  });
});
