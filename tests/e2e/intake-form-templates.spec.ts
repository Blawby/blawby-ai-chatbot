import { randomUUID } from 'crypto';
import { expect, test } from './fixtures.public';
import { buildWidgetUrl } from './helpers/widgetComposer';

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

  test('public widget honors custom template bootstrap data in public mode', async ({
    browser,
  }, testInfo) => {
    const practiceSlug = normalizePracticeSlug(DEFAULT_PRACTICE_SLUG);
    const uniqueId = randomUUID().slice(0, 8);
    const customTemplateSlug = `e2e-custom-template-${uniqueId}`;

    const customIntakeTemplate: JsonRecord = {
      id: `e2e-template-${uniqueId}`,
      slug: customTemplateSlug,
      name: `E2E Custom Template ${uniqueId}`,
      is_default: false,
      isDefault: false,
      introMessage: 'Tell us what happened and answer the custom intake questions.',
      legalDisclaimer: 'This chat collects details for attorney review.',
      paymentLinkEnabled: false,
      fields: [
        {
          key: 'description',
          label: 'Case description',
          type: 'text',
          required: true,
          phase: 'required',
          isStandard: true,
          promptHint: 'Ask for a concise summary of the legal issue.',
        },
        {
          key: 'city',
          label: 'City',
          type: 'text',
          required: true,
          phase: 'required',
          isStandard: true,
          promptHint: 'Ask for the city where the issue happened.',
        },
        {
          key: 'state',
          label: 'State',
          type: 'text',
          required: true,
          phase: 'required',
          isStandard: true,
          promptHint: 'Ask for the state or jurisdiction.',
        },
        {
          key: `urgencyLevel${uniqueId}`,
          label: 'How urgent is this issue?',
          type: 'select',
          required: true,
          phase: 'required',
          isStandard: false,
          validationHint: 'Choose exactly one of: Low, Medium, High',
          promptHint: 'Only accept one of the provided urgency options.',
          options: ['Low', 'Medium', 'High'],
        },
        {
          key: `hearingDate${uniqueId}`,
          label: 'What is the next court or hearing date?',
          type: 'date',
          required: false,
          phase: 'enrichment',
          isStandard: false,
          validationHint: 'Use YYYY-MM-DD',
          promptHint: 'Ask for the next court date only if one exists.',
        },
        {
          key: `hasPaperwork${uniqueId}`,
          label: 'Do you already have paperwork or evidence?',
          type: 'boolean',
          required: false,
          phase: 'enrichment',
          isStandard: false,
          validationHint: 'Answer yes or no',
          promptHint: 'Resolve this to a yes/no answer.',
        },
        {
          key: `estimatedLoss${uniqueId}`,
          label: 'Estimated dollars at stake',
          type: 'number',
          required: false,
          phase: 'enrichment',
          isStandard: false,
          validationHint: 'Numbers only',
          promptHint: 'Extract the approximate dollar amount as a number.',
        },
      ],
    };

    const customContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL as string,
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { Cookie: '' },
    });
    const customPage = await customContext.newPage();
    const conversationCreatePayloads: JsonRecord[] = [];
    customPage.on('request', (request) => {
      if (request.method() !== 'POST') return;
      if (!/\/api\/conversations(?:\?|$)/.test(request.url())) return;
      const payload = request.postDataJSON();
      const record = asRecord(payload);
      if (record) conversationCreatePayloads.push(record);
    });

    await customPage.route(`**/api/widget/bootstrap**template=${customTemplateSlug}**`, async (route) => {
      const response = await route.fetch();
      const payload = await response.json() as JsonRecord;
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        body: JSON.stringify({
          ...payload,
          intakeTemplate: customIntakeTemplate,
        }),
      });
    });

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
        `${buildWidgetUrl(practiceSlug)}&template=${encodeURIComponent(customTemplateSlug)}`,
        { waitUntil: 'domcontentloaded' },
      );

      const customTemplate = asRecord(customIntakeTemplate);
      const customFields = Array.isArray(customTemplate?.fields)
        ? customTemplate!.fields.map((field) => asRecord(field)).filter(Boolean) as JsonRecord[]
        : [];

      expect(
        customFields.some((field) => field.key === `urgencyLevel${uniqueId}` && field.type === 'select'),
        `Custom bootstrap should include the select field: ${JSON.stringify(customTemplate)}`,
      ).toBe(true);
      expect(
        customFields.some((field) => field.key === `hearingDate${uniqueId}` && field.type === 'date'),
        `Custom bootstrap should include the date field: ${JSON.stringify(customTemplate)}`,
      ).toBe(true);
      expect(
        customFields.some((field) => field.key === `hasPaperwork${uniqueId}` && field.type === 'boolean'),
        `Custom bootstrap should include the boolean field: ${JSON.stringify(customTemplate)}`,
      ).toBe(true);
      expect(
        customFields.some((field) => field.key === `estimatedLoss${uniqueId}` && field.type === 'number'),
        `Custom bootstrap should include the number field: ${JSON.stringify(customTemplate)}`,
      ).toBe(true);

      const urgencyField = customFields.find((field) => field.key === `urgencyLevel${uniqueId}`) ?? null;
      expect(urgencyField?.validationHint).toBe('Choose exactly one of: Low, Medium, High');
      expect(urgencyField?.options).toEqual(['Low', 'Medium', 'High']);

      await customPage.locator(
        'input[placeholder*="full name" i], input[name="name"], label:has-text("Name") + input',
      ).first().fill(`Public Template ${uniqueId}`);
      await customPage.locator('input[type="email"]').first().fill(`public-template-${uniqueId}@test-blawby.com`);
      await customPage.locator('input[type="tel"]').first().fill('5555551212');
      await customPage.getByRole('button', { name: /continue/i }).first().click();

      await expect
        .poll(
          () => conversationCreatePayloads.length,
          { timeout: 15_000, message: 'Expected a conversation create request carrying intake template metadata.' },
        )
        .toBeGreaterThan(0);

      const createPayload = conversationCreatePayloads[conversationCreatePayloads.length - 1];
      const metadata = asRecord(createPayload.metadata);
      const embeddedTemplate = asRecord(metadata?.intakeTemplate);

      await testInfo.attach('public-custom-template-create-payload.json', {
        body: JSON.stringify(createPayload, null, 2),
        contentType: 'application/json',
      });

      expect(embeddedTemplate?.slug).toBe(customTemplateSlug);
      expect(
        Array.isArray(embeddedTemplate?.fields)
          && embeddedTemplate.fields.some((field) => asRecord(field)?.key === `urgencyLevel${uniqueId}`),
        `Conversation metadata should carry the custom template: ${JSON.stringify(embeddedTemplate)}`,
      ).toBe(true);

      await expect(customPage).toHaveURL(
        new RegExp(`\\/public\\/${stringifyForRegex(practiceSlug)}\\?v=widget&template=${stringifyForRegex(customTemplateSlug)}$`),
      );
    } finally {
      await customPage.close();
      await customContext.close();
    }
  });
});
