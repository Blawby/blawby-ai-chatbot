import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { expect, test } from './fixtures.auth';
import { buildWidgetUrl, prepareWidgetComposer } from './helpers/widgetComposer';
import { loadE2EConfig } from './helpers/e2eConfig';
import { AUTH_STATE_PATHS } from './helpers/authState';
import { fetchJsonViaPage } from './helpers/http';

const DEFAULT_PRACTICE_SLUG =
  process.env.E2E_WIDGET_SLUG ?? process.env.E2E_PRACTICE_SLUG ?? 'demo-owner-local';

type JsonRecord = Record<string, unknown>;

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

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;

const stringifyForRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('Public intake form templates', () => {
  test.describe.configure({ timeout: 240000 });

  test('public widget resolves real custom template from backend', async ({
    browser,
    ownerPage,
  }, testInfo) => {
    // API integration test — no browser-specific behavior. Skip non-chromium
    // projects to avoid parallel rate-limit collisions on the template create endpoint.
    if (testInfo.project.name !== 'chromium') {
      test.skip(true, 'API integration test — runs in chromium project only');
      return;
    }

    const e2eConfig = loadE2EConfig();
    if (!e2eConfig || !existsSync(AUTH_STATE_PATHS.owner)) {
      test.skip(true, 'E2E credentials or owner auth state not present — run npm run test:e2e:auth first');
      return;
    }

    const { practice, owner } = e2eConfig;
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const uniqueId = randomUUID().slice(0, 8);
    const templateSlug = `e2e-live-${uniqueId}`;
    let createdTemplateId: string | null = null;

    // Navigate to a stable authenticated page so the browser context has the right origin
    // and the React app is settled before we make fetch calls.
    await ownerPage.goto('/', { waitUntil: 'domcontentloaded' });
    try {
      await ownerPage.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // networkidle can hang on complex apps; domcontentloaded is sufficient
    }

    // Bail early if the session is invalid — would mean the auth global setup needs to re-run.
    if (ownerPage.url().includes('/auth')) {
      test.skip(true, 'Owner session expired — run npm run test:e2e:auth to refresh');
      return;
    }

    const templatePayload = {
      slug: templateSlug,
      name: `E2E Live Template ${uniqueId}`,
      status: 'published',
      fields: [
        {
          key: 'description',
          label: 'Case description',
          field_type: 'text',
          phase: 'required',
          required: true,
          order_index: 0,
          is_standard: true,
          prompt_hint: 'Ask for a concise summary of the legal issue.',
        },
        {
          key: 'city',
          label: 'City',
          field_type: 'text',
          phase: 'required',
          required: true,
          order_index: 1,
          is_standard: true,
          prompt_hint: 'Ask for the city where the issue happened.',
        },
        {
          key: 'state',
          label: 'State',
          field_type: 'text',
          phase: 'required',
          required: true,
          order_index: 2,
          is_standard: true,
          prompt_hint: 'Ask for the state or jurisdiction.',
        },
        {
          key: `urgencyLevel${uniqueId}`,
          label: 'How urgent is this issue?',
          field_type: 'select',
          phase: 'required',
          required: true,
          order_index: 3,
          is_standard: false,
          help_text: 'Choose exactly one of: Low, Medium, High',
          prompt_hint: 'Only accept one of the provided urgency options.',
          options: [
            { value: 'Low', label: 'Low' },
            { value: 'Medium', label: 'Medium' },
            { value: 'High', label: 'High' },
          ],
        },
        {
          key: `hearingDate${uniqueId}`,
          label: 'What is the next court or hearing date?',
          field_type: 'date',
          phase: 'enrichment',
          required: false,
          order_index: 4,
          is_standard: false,
          help_text: 'Use YYYY-MM-DD',
          prompt_hint: 'Ask for the next court date only if one exists.',
        },
        {
          key: `hasPaperwork${uniqueId}`,
          label: 'Do you already have paperwork or evidence?',
          field_type: 'boolean',
          phase: 'enrichment',
          required: false,
          order_index: 5,
          is_standard: false,
          help_text: 'Answer yes or no',
          prompt_hint: 'Resolve this to a yes/no answer.',
        },
        {
          key: `estimatedLoss${uniqueId}`,
          label: 'Estimated dollars at stake',
          field_type: 'number',
          phase: 'enrichment',
          required: false,
          order_index: 6,
          is_standard: false,
          help_text: 'Numbers only',
          prompt_hint: 'Extract the approximate dollar amount as a number.',
        },
      ],
    };

    // Diagnostic: check session state before attempting template create.
    const sessionResult = await fetchJsonViaPage(ownerPage, '/api/auth/get-session');
    const sessionData = sessionResult.data as Record<string, unknown> | undefined;
    const activeOrgId = (sessionData?.session as Record<string, unknown> | undefined)?.activeOrganizationId;
    console.log('[e2e] session.activeOrganizationId before template create:', activeOrgId ?? 'null/undefined');

    // If no active org in the session, set it now via the org list.
    if (!activeOrgId) {
      const orgListResult = await fetchJsonViaPage(ownerPage, '/api/auth/organization/list');
      const orgs = Array.isArray(orgListResult.data)
        ? orgListResult.data as Array<Record<string, unknown>>
        : Array.isArray((orgListResult.data as Record<string, unknown>)?.organizations)
          ? (orgListResult.data as Record<string, unknown>).organizations as Array<Record<string, unknown>>
          : [];
      const firstOrgId = typeof orgs[0]?.id === 'string' ? orgs[0].id : null;
      console.log('[e2e] org list:', JSON.stringify(orgs.map((o) => ({ id: o.id, name: o.name }))));
      if (firstOrgId) {
        const setActiveResult = await fetchJsonViaPage(ownerPage, '/api/auth/organization/set-active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: firstOrgId }),
        });
        console.log('[e2e] set-active-org result:', setActiveResult.status, JSON.stringify(setActiveResult.data ?? setActiveResult.error));
      } else {
        console.warn('[e2e] No organizations found for owner — template create will likely fail');
      }
    }

    console.log('[e2e] template create payload fields count:', templatePayload.fields.length);

    try {
      // Create and publish the template via browser fetch — cookies are sent from the owner page.
      // Retry once on 429 (backend rate limit).
      let createResult = await fetchJsonViaPage(
        ownerPage,
        `/api/practice/${practice.id}/intake-templates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templatePayload),
        },
      );

      if (createResult.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        createResult = await fetchJsonViaPage(
          ownerPage,
          `/api/practice/${practice.id}/intake-templates`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templatePayload),
          },
        );
      }

      console.log('[e2e] template create response:', createResult.status, JSON.stringify(createResult.data ?? createResult.error));

      if (createResult.status < 200 || createResult.status >= 300) {
        throw new Error(`Template create failed: ${createResult.status} ${JSON.stringify(createResult.error ?? createResult.data)}`);
      }

      const templateRecord = asRecord(createResult.data?.template) ?? asRecord(asRecord(createResult.data)?.template);
      createdTemplateId = typeof templateRecord?.id === 'string' ? templateRecord.id : null;
      expect(createdTemplateId, `Expected template.id in create response: ${JSON.stringify(createResult.data)}`).toBeTruthy();

      await testInfo.attach('created-template.json', {
        body: JSON.stringify(createResult.data, null, 2),
        contentType: 'application/json',
      });

      // Open the public widget with ?template={slug} in a fresh anonymous context.
      // The worker passes template_slug to the public intake settings endpoint — no auth token needed.
      const customContext = await browser.newContext({
        baseURL: testInfo.project.use.baseURL as string,
        storageState: { cookies: [], origins: [] },
        extraHTTPHeaders: { Cookie: '' },
      });
      const customPage = await customContext.newPage();
      const conversationCreatePayloads: JsonRecord[] = [];
      let bootstrapPayload: JsonRecord | null = null;

      customPage.on('request', (req) => {
        if (req.method() !== 'POST') return;
        if (!/\/api\/conversations(?:\?|$)/.test(req.url())) return;
        const payload = req.postDataJSON();
        const record = asRecord(payload);
        if (record) conversationCreatePayloads.push(record);
      });

      // Capture the live bootstrap response so we can assert the real template was resolved.
      customPage.on('response', (res) => {
        if (!res.url().includes('/api/widget/bootstrap')) return;
        void res.json().then((data) => {
          bootstrapPayload = asRecord(data);
        }).catch(async (error: unknown) => {
          const responseText = await res.text().catch(() => '');
          console.error('[bootstrap] Failed to parse widget bootstrap response', {
            url: res.url(),
            error,
            responseText,
          });
        });
      });

      // Keep the AI chat response stubbed — deterministic and fast.
      await customPage.route('**/api/ai/chat', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: `data: ${JSON.stringify({
            done: true,
            message: 'Thanks, I saved those details and will ask the next intake question.',
            intakeFields: {
              description: 'A contract dispute',
              city: 'Raleigh',
              state: 'NC',
            },
          })}\n\n`,
        });
      });

      try {
        await customPage.goto(
          `${buildWidgetUrl(practiceSlug)}&template=${encodeURIComponent(templateSlug)}`,
          { waitUntil: 'domcontentloaded' },
        );

        // prepareWidgetComposer handles the full flow: slim form → disclaimer → CTA.
        // Returns once the message composer is enabled (conversation exists).
        await prepareWidgetComposer(customPage, 'E2E Test Client', owner.email);

        await expect
          .poll(
            () => conversationCreatePayloads.length,
            { timeout: 15_000, message: 'Expected a conversation create request carrying intake template metadata.' },
          )
          .toBeGreaterThan(0);

        const createPayload = conversationCreatePayloads[conversationCreatePayloads.length - 1];
        const metadata = asRecord(createPayload.metadata);
        const embeddedTemplate = asRecord(metadata?.intakeTemplate);

        await testInfo.attach('bootstrap-payload.json', {
          body: JSON.stringify(bootstrapPayload, null, 2),
          contentType: 'application/json',
        });
        await testInfo.attach('conversation-create-payload.json', {
          body: JSON.stringify(createPayload, null, 2),
          contentType: 'application/json',
        });

        // Bootstrap resolved the real slug — not the practice default.
        const bootstrapTemplate = asRecord(bootstrapPayload?.intakeTemplate);
        expect(
          bootstrapTemplate?.slug,
          `Bootstrap should return the real template slug, got: ${JSON.stringify(bootstrapPayload)}`,
        ).toBe(templateSlug);

        // Conversation create embeds the correct template.
        expect(
          embeddedTemplate?.slug,
          `Embedded template slug mismatch: ${JSON.stringify(embeddedTemplate)}`,
        ).toBe(templateSlug);

        // All structured field types survive the bootstrap normalizer.
        expect(
          embeddedTemplate && Array.isArray(embeddedTemplate.fields),
          `Expected embeddedTemplate.fields to be an array: ${JSON.stringify(embeddedTemplate)}`,
        ).toBe(true);

        const fields = (embeddedTemplate.fields as unknown[]).map(asRecord).filter(Boolean) as JsonRecord[];

        expect(
          fields.some((f) => f.key === `urgencyLevel${uniqueId}` && f.type === 'select'),
          `Custom select field missing from embedded template: ${JSON.stringify(fields)}`,
        ).toBe(true);
        expect(
          fields.some((f) => f.key === `hearingDate${uniqueId}` && f.type === 'date'),
          'Date field missing from embedded template',
        ).toBe(true);
        expect(
          fields.some((f) => f.key === `hasPaperwork${uniqueId}` && f.type === 'boolean'),
          'Boolean field missing from embedded template',
        ).toBe(true);
        expect(
          fields.some((f) => f.key === `estimatedLoss${uniqueId}` && f.type === 'number'),
          'Number field missing from embedded template',
        ).toBe(true);

        const urgencyField = fields.find((f) => f.key === `urgencyLevel${uniqueId}`) ?? null;
        expect(urgencyField?.validationHint).toBe('Choose exactly one of: Low, Medium, High');
        expect(urgencyField?.options).toEqual(['Low', 'Medium', 'High']);

        await expect(customPage).toHaveURL(
          new RegExp(`\\/public\\/${stringifyForRegex(practiceSlug)}\\?v=widget&template=${stringifyForRegex(templateSlug)}$`),
        );
      } finally {
        await customPage.close();
        await customContext.close();
      }
    } finally {
      if (createdTemplateId) {
        await fetchJsonViaPage(
          ownerPage,
          `/api/practice/${practice.id}/intake-templates/${createdTemplateId}`,
          { method: 'DELETE' },
        ).catch((err: unknown) => {
          console.warn(`[cleanup] Failed to delete test template ${createdTemplateId}: ${err}`);
        });
      }
    }
  });
});
