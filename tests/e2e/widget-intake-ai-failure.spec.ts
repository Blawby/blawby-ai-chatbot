/**
 * E2E coverage for the AI failure path on the public widget intake flow.
 *
 * Worker affordance: aiChat.ts short-circuits the AI request to a 503 when
 * `INTAKE_AI_FORCE_FAILURE=true` AND `NODE_ENV !== 'production'`. This spec
 * skips when either condition isn't satisfied so it doesn't flake when run
 * against a normal dev/staging environment without the affordance enabled.
 *
 * To run: set INTAKE_AI_FORCE_FAILURE=true in worker/.dev.vars (or pass
 * --var INTAKE_AI_FORCE_FAILURE=true to wrangler dev) and then run
 * `npm run test:e2e -- widget-intake-ai-failure.spec.ts`.
 *
 * Verifies (U11 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md):
 *   - widget renders the hard-error UI with the canonical copy
 *   - backend `POST /api/practice-client-intakes/create` fires with
 *     custom_fields._worker_conversation_id (partial-intake submission per U7)
 *   - composer is disabled and inline error region has role=alert
 */

import { expect, test } from './fixtures.public';
import { prepareWidgetComposer, buildWidgetUrl } from './helpers/widgetComposer';

const DEFAULT_PRACTICE_SLUG =
  process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'paul-yahoo';

const FORCE_FAILURE_ENABLED =
  String(process.env.E2E_INTAKE_AI_FORCE_FAILURE ?? '').toLowerCase() === 'true';

const HARD_ERROR_COPY = "We've passed what you've told us to the practice";

test.describe('Public widget intake — AI failure path (U11)', () => {
  test.skip(!FORCE_FAILURE_ENABLED, 'Requires INTAKE_AI_FORCE_FAILURE=true on the worker; set E2E_INTAKE_AI_FORCE_FAILURE=true to run.');
  test.describe.configure({ timeout: 300000 });

  test('widget renders hard-error UI and backend receives partial intake', async ({ anonPage }) => {
    const practiceSlug = DEFAULT_PRACTICE_SLUG;
    const contactEmail = `e2e-failure-${Date.now()}@example.com`;
    const contactName = 'E2E Failure Test';

    await anonPage.goto(buildWidgetUrl(practiceSlug));
    const { messageInput } = await prepareWidgetComposer(anonPage, contactName, contactEmail);

    // Arm the waiter BEFORE sending the message so we don't miss the
    // partial-intake POST. Using waitForRequest (instead of an `on('request')`
    // array capture) gives us a deterministic await with its own timeout
    // independent of the assertion ordering below.
    const partialSubmitWaiter = anonPage.waitForRequest(
      (request) =>
        request.url().includes('/api/practice-client-intakes/create') &&
        request.method() === 'POST',
      { timeout: 60_000 },
    );

    // Send a message — this triggers the AI request which the worker forces
    // to 503 because INTAKE_AI_FORCE_FAILURE is set.
    await messageInput.fill('I need help with a contract dispute');
    await messageInput.press('Enter');

    // Composer should disable + inline error banner should appear.
    const hardError = anonPage.getByTestId('composer-hard-error');
    await expect(hardError).toBeVisible({ timeout: 30_000 });
    await expect(hardError).toHaveText(new RegExp(HARD_ERROR_COPY, 'i'));
    await expect(hardError).toHaveAttribute('role', 'alert');
    await expect(hardError).toHaveAttribute('aria-live', 'assertive');
    await expect(messageInput).toBeDisabled();

    // Backend should have received a POST /create with the conversation_id —
    // the worker submits partial intake on AI failure (U7 / R14 / AE5).
    // Staging rejects worker-local ids in the backend-owned top-level
    // conversation_id field, so the worker stores the link in custom_fields.
    const submitRequest = await partialSubmitWaiter;
    const body = submitRequest.postData();
    const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null;
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('conversation_id');
    expect(typeof (parsed?.custom_fields as Record<string, unknown> | undefined)?._worker_conversation_id).toBe('string');
    expect(typeof parsed?.email).toBe('string');
    expect(typeof parsed?.name).toBe('string');
  });

  test('reload preserves hard-error state via conversation envelope', async ({ anonPage }) => {
    const practiceSlug = DEFAULT_PRACTICE_SLUG;
    const contactEmail = `e2e-reload-${Date.now()}@example.com`;
    const contactName = 'E2E Reload Test';

    await anonPage.goto(buildWidgetUrl(practiceSlug));
    const { messageInput } = await prepareWidgetComposer(anonPage, contactName, contactEmail);
    await messageInput.fill('I need help with a contract dispute');
    await messageInput.press('Enter');

    const hardError = anonPage.getByTestId('composer-hard-error');
    await expect(hardError).toBeVisible({ timeout: 30_000 });

    // Reload — the SSE event is gone, but the conversation envelope carries
    // ai_failed_at, so the widget re-renders the disabled state from cold.
    await anonPage.reload();

    const hardErrorAfterReload = anonPage.getByTestId('composer-hard-error');
    await expect(hardErrorAfterReload).toBeVisible({ timeout: 30_000 });
    await expect(hardErrorAfterReload).toHaveText(new RegExp(HARD_ERROR_COPY, 'i'));
  });
});
