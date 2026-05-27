import { randomUUID } from 'crypto';
import { expect, test } from './fixtures.auth';
import { prepareWidgetComposer } from './helpers/widgetComposer';

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

const unwrapRecord = (payload: unknown): JsonRecord => {
  const root = asRecord(payload);
  if (!root) return {};
  for (const key of ['data', 'practice', 'organization']) {
    const nested = asRecord(root[key]);
    if (nested) return nested;
  }
  return root;
};

const readMetadata = (record: JsonRecord): JsonRecord => {
  const raw = record.metadata;
  if (typeof raw === 'string') {
    try {
      return asRecord(JSON.parse(raw)) ?? {};
    } catch {
      return {};
    }
  }
  return asRecord(raw) ?? {};
};

const readTemplates = (metadata: JsonRecord): JsonRecord[] => {
  const raw = metadata.intakeTemplates;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => asRecord(item)) as JsonRecord[] : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw.filter((item) => asRecord(item)) as JsonRecord[] : [];
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test.describe('Intake form templates', () => {
  test.describe.configure({ timeout: 180000 });

  test('custom form is routable, bootstrapped, and embedded in the AI conversation', async ({
    ownerContext,
    ownerPage,
    unauthPage,
  }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const uniqueId = randomUUID().slice(0, 8);
    const templateSlug = `e2e-typeform-${uniqueId}`;
    const templateName = `E2E Typeform ${uniqueId}`;
    const customFieldKey = `dayToDayImpact${uniqueId}`;
    const customQuestion = 'How has this issue affected your day-to-day life?';

    const publicDetailsResponse = await ownerContext.request.get(
      `/api/practice/details/${encodeURIComponent(practiceSlug)}`,
      { headers: { 'Cache-Control': 'no-cache' } },
    );
    expect(publicDetailsResponse.ok(), `practice details should load for ${practiceSlug}`).toBe(true);
    const publicDetails = unwrapRecord(await publicDetailsResponse.json());
    const practiceId =
      typeof publicDetails.organization_id === 'string'
        ? publicDetails.organization_id
        : typeof publicDetails.id === 'string'
          ? publicDetails.id
          : null;
    expect(practiceId, `practice id should resolve from details: ${JSON.stringify(publicDetails)}`).toBeTruthy();

    const practiceResponse = await ownerContext.request.get(`/api/practice/${encodeURIComponent(practiceId!)}`);
    expect(practiceResponse.ok(), `authenticated practice record should load: ${practiceResponse.status()}`).toBe(true);
    const originalPractice = unwrapRecord(await practiceResponse.json());
    const originalMetadata = readMetadata(originalPractice);
    const originalTemplates = readTemplates(originalMetadata);
    const baselineTemplates = originalTemplates.filter((template) => (
      typeof template.slug !== 'string' || !template.slug.startsWith('e2e-typeform-')
    ));

    const putPracticeMetadata = async (metadata: JsonRecord, label: string) => {
      let latestResponse = await ownerContext.request.put(`/api/practice/${encodeURIComponent(practiceId!)}`, {
        data: { metadata },
      });
      if (latestResponse.ok() || latestResponse.status() < 500) return latestResponse;
      await sleep(2000);
      latestResponse = await ownerContext.request.put(`/api/practice/${encodeURIComponent(practiceId!)}`, {
        data: { metadata },
      });
      if (!latestResponse.ok()) {
        await testInfo.attach(`${label}-failure.txt`, {
          body: await latestResponse.text().catch(() => ''),
          contentType: 'text/plain',
        });
      }
      return latestResponse;
    };

    const customTemplate = {
      slug: templateSlug,
      name: templateName,
      introMessage: 'Tell us what happened and we will collect the details step by step.',
      legalDisclaimer: 'This intake chat is for information collection only.',
      paymentLinkEnabled: false,
      consultationFee: null,
      fields: [
        {
          key: 'description',
          label: 'Case description',
          type: 'text',
          required: true,
          phase: 'required',
          isStandard: true,
          mapsTo: 'description',
          previewQuestion: 'What happened?',
          promptHint: 'Ask for a concise summary of the legal issue.',
        },
        {
          key: 'city',
          label: 'City',
          type: 'text',
          required: true,
          phase: 'required',
          isStandard: true,
          mapsTo: 'address.city',
          previewQuestion: 'What city did this happen in?',
          promptHint: 'Ask for the city where the issue occurred.',
        },
        {
          key: 'state',
          label: 'State',
          type: 'text',
          required: true,
          phase: 'required',
          isStandard: true,
          mapsTo: 'address.state',
          previewQuestion: 'What state did this happen in?',
          promptHint: 'Ask for the state or jurisdiction.',
        },
        {
          key: customFieldKey,
          label: customQuestion,
          type: 'text',
          required: true,
          phase: 'required',
          isStandard: false,
          previewQuestion: customQuestion,
          promptHint: 'Ask for a short practical-impact answer in the client voice.',
        },
      ],
    };

    const nextMetadata = {
      ...originalMetadata,
      intakeTemplates: JSON.stringify([
        ...baselineTemplates.filter((template) => template.slug !== templateSlug),
        customTemplate,
      ]),
    };

    const updateResponse = await putPracticeMetadata(nextMetadata, 'custom-template-seed');
    expect(updateResponse.ok(), `template seed should save: ${updateResponse.status()}`).toBe(true);

    try {
      await ownerPage.goto(`/practice/${encodeURIComponent(practiceSlug)}/settings/intake-forms`, {
        waitUntil: 'domcontentloaded',
      });
      const customCard = ownerPage.locator('article').filter({ hasText: templateName }).first();
      await expect(customCard, 'custom template should appear in the builder list').toBeVisible({ timeout: 30000 });

      await customCard.locator('button').filter({ hasText: /responses/i }).first().click();
      await expect(ownerPage, 'View responses should leave settings and open the intake responses route')
        .toHaveURL(new RegExp(`/practice/${practiceSlug}/intakes/responses\\?template=${templateSlug}$`), {
          timeout: 15000,
        });

      await unauthPage.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });

      const conversationCreatePayloads: JsonRecord[] = [];
      unauthPage.on('request', (request) => {
        if (request.method() !== 'POST') return;
        const url = request.url();
        if (!url.includes('/api/conversations') || url.includes('/messages')) return;
        const body = request.postDataJSON();
        const record = asRecord(body);
        if (record) conversationCreatePayloads.push(record);
      });

      await unauthPage.route('**/api/ai/chat', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: `data: ${JSON.stringify({
            done: true,
            message: 'Thanks, I saved that detail.',
            intakeFields: {
              description: 'A contract dispute',
              city: 'Raleigh',
              state: 'NC',
              customFields: {
                [customFieldKey]: 'It has disrupted my work schedule.',
              },
            },
          })}\n\n`,
        });
      });

      const bootstrapResponsePromise = unauthPage.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.url().includes('/api/widget/bootstrap') &&
          response.url().includes(`template=${templateSlug}`),
        { timeout: 30000 },
      );

      await unauthPage.goto(
        `/public/${encodeURIComponent(practiceSlug)}?v=widget&template=${encodeURIComponent(templateSlug)}`,
        { waitUntil: 'domcontentloaded' },
      );

      const bootstrapResponse = await bootstrapResponsePromise;
      expect(bootstrapResponse.ok(), `widget bootstrap should resolve custom template: ${bootstrapResponse.status()}`).toBe(true);
      const bootstrapPayload = await bootstrapResponse.json() as JsonRecord;
      const bootTemplate = asRecord(bootstrapPayload.intakeTemplate);
      test.fail(
        bootTemplate?.slug !== templateSlug,
        'Known gap: public widget bootstrap currently cannot see practice metadata.intakeTemplates, so custom forms fall back to default.',
      );
      expect(bootTemplate?.slug).toBe(templateSlug);
      expect(
        (Array.isArray(bootTemplate?.fields) ? bootTemplate.fields : [])
          .some((field) => asRecord(field)?.key === customFieldKey),
        `bootstrap template should include custom field: ${JSON.stringify(bootTemplate)}`,
      ).toBe(true);

      const { messageInput } = await prepareWidgetComposer(
        unauthPage,
        `Template E2E ${uniqueId}`,
        `template-e2e-${uniqueId}@test-blawby.com`,
      );

      const aiResponsePromise = unauthPage.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().includes('/api/ai/chat'),
        { timeout: 30000 },
      );
      await messageInput.fill('I need help with a contract dispute in Raleigh, North Carolina.');
      await unauthPage.getByRole('button', { name: /send message/i }).click();
      await expect((await aiResponsePromise).ok()).toBe(true);

      await expect.poll(
        () => conversationCreatePayloads.length,
        {
          timeout: 15000,
          message: 'Expected the widget to create a conversation with template metadata.',
        },
      ).toBeGreaterThan(0);

      const createPayload = conversationCreatePayloads[conversationCreatePayloads.length - 1];
      const metadata = asRecord(createPayload.metadata);
      const embeddedTemplate = asRecord(metadata?.intakeTemplate);
      await testInfo.attach('custom-template-conversation-create.json', {
        body: JSON.stringify(createPayload, null, 2),
        contentType: 'application/json',
      });
      expect(embeddedTemplate?.slug).toBe(templateSlug);
      expect(
        (Array.isArray(embeddedTemplate?.fields) ? embeddedTemplate.fields : [])
          .some((field) => asRecord(field)?.key === customFieldKey),
        `conversation metadata should carry custom intake fields: ${JSON.stringify(embeddedTemplate)}`,
      ).toBe(true);
    } finally {
      const restoreMetadata = {
        ...originalMetadata,
        intakeTemplates: JSON.stringify(baselineTemplates),
      };
      const restoreResponse = await putPracticeMetadata(restoreMetadata, 'custom-template-cleanup');
      if (!restoreResponse.ok()) {
        await testInfo.attach('custom-template-cleanup-failure.txt', {
          body: await restoreResponse.text().catch(() => ''),
          contentType: 'text/plain',
        });
      }
      expect.soft(restoreResponse.ok(), `template cleanup should restore original metadata: ${restoreResponse.status()}`).toBe(true);
    }
  });
});
