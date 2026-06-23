import { expect, test } from './fixtures.auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();
const resolvePracticeSlug = (value: string | null | undefined): string => {
  if (!value) return 'demo-owner-local';
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? 'demo-owner-local';
  } catch {
    return value;
  }
};

const PRACTICE_SLUG = resolvePracticeSlug(e2eConfig?.practice.slug ?? process.env.E2E_PRACTICE_SLUG);
const ENGAGEMENTS_BASE = `/practice/${encodeURIComponent(PRACTICE_SLUG)}/engagements`;
const CREATE_PATH = `${ENGAGEMENTS_BASE}/new`;

const validDraftEngagement = {
  id: 'e2e-engagement-valid-draft',
  intake_id: 'e2e-intake-valid-draft',
  matter_id: null,
  organization_id: e2eConfig?.practice.id ?? 'e2e-practice',
  status: 'draft',
  client_name: 'E2E Proper Client',
  client_email: 'proper-client@test-blawby.com',
  contract_body: 'Engagement agreement body for E2E proper data.',
  billing_snapshot: null,
  proposal_data: {
    representation: {
      scope_summary: 'Draft an engagement letter for proper E2E data.',
      included_services: ['Initial consultation', 'Document review'],
      excluded_services: ['Trial representation'],
      client_identity_notes: '',
      jurisdiction_notes: 'Texas',
    },
    fees: {
      billing_type: 'flat_fee',
      fixed_fee_amount: 2500,
      hourly_rate_attorney: null,
      hourly_rate_admin: null,
      contingency_percentage: null,
      retainer_amount: 1000,
      payment_frequency: 'upfront',
      fee_notes: 'E2E fee terms',
    },
    risk_review: {
      conflict_status: 'clear',
      jurisdiction_status: 'supported',
      risk_notes: [],
      open_questions: [],
      conflict_note: null,
    },
    client_summary: {
      client_name: 'E2E Proper Client',
      matter_summary: 'E2E Proper Matter',
      location_summary: 'Austin, Texas',
      goals_summary: 'Confirm the UI renders valid engagement data.',
      co_clients: [],
      non_clients: [],
    },
    draft_meta: {
      version: 1,
      generated_at: '2026-06-20T00:00:00.000Z',
      generated_by: 'e2e',
    },
    source_snapshot: {
      intake_uuid: 'e2e-intake-valid-draft',
      conversation_id: 'e2e-conversation-valid-draft',
      matter_id: '',
      practice_area: 'business',
      urgency: 'routine',
      desired_outcome: 'Validate engagement list rendering',
      opposing_party: '',
      court_date: null,
    },
    acknowledgment_language: 'Client acknowledges the scope.',
    no_guarantee_language: 'No outcome is guaranteed.',
  },
  engagement_notes: 'E2E note',
  sent_at: null,
  accepted_at: null,
  declined_at: null,
  signed_pdf_s3_key: null,
  created_by: 'e2e-owner',
  created_at: '2026-06-20T00:00:00.000Z',
  updated_at: '2026-06-20T00:00:00.000Z',
};

const malformedDraftEngagement = {
  id: 'e2e-engagement-malformed-draft',
  intake_id: 'e2e-intake-malformed-draft',
  matter_id: null,
  organization_id: e2eConfig?.practice.id ?? 'e2e-practice',
  status: 'draft',
  contract_body: 'Malformed E2E engagement body.',
  billing_snapshot: null,
  proposal_data: {
    draft_meta: {
      version: 1,
      generated_at: '2026-06-20T00:00:00.000Z',
      generated_by: 'e2e',
    },
    source_snapshot: {
      intake_uuid: 'e2e-intake-malformed-draft',
    },
  },
  created_by: 'e2e-owner',
  created_at: '2026-06-20T00:00:00.000Z',
  updated_at: '2026-06-20T00:00:00.000Z',
};

test.describe('engagements create page', () => {
  // Raise the per-test budget — staging API responses can be slow.
  test.setTimeout(60000);

  test('list renders proper engagement data and drops malformed rows', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1440, height: 900 });

    const engagementRequests: string[] = [];
    const engagementErrors: string[] = [];
    ownerPage.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('[engagementsApi]')) {
        engagementErrors.push(message.text());
      }
    });

    await ownerPage.route('**/api/engagement-contracts/**', async (route) => {
      const url = new URL(route.request().url());
      engagementRequests.push(`${url.pathname}${url.search}`);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [validDraftEngagement, malformedDraftEngagement],
          pagination: {
            page: Number(url.searchParams.get('page') ?? '1'),
            limit: Number(url.searchParams.get('limit') ?? '20'),
            total: 2,
          },
        }),
      });
    });

    await ownerPage.goto(ENGAGEMENTS_BASE, { waitUntil: 'domcontentloaded' });

    await expect(ownerPage.getByText('E2E Proper Client').filter({ visible: true })).toBeVisible({ timeout: 20000 });
    await expect(ownerPage.getByText('E2E Proper Matter').filter({ visible: true })).toBeVisible();
    await expect(ownerPage.getByText('Flat fee').filter({ visible: true })).toBeVisible();
    await expect(ownerPage.getByText('$1,000').filter({ visible: true })).toBeVisible();
    await expect(ownerPage.getByText('No engagements found')).not.toBeVisible();
    await expect(ownerPage.getByText('e2e-engagement-malformed-draft')).not.toBeVisible();
    expect(engagementErrors.some((entry) => entry.includes('e2e-engagement-malformed-draft'))).toBe(true);

    await ownerPage.getByRole('button', { name: 'Draft' }).click();

    await expect(ownerPage.getByText('E2E Proper Client').filter({ visible: true })).toBeVisible({ timeout: 20000 });
    await expect(ownerPage.getByText('No draft engagements found')).not.toBeVisible();
    expect(engagementRequests.filter((request) => request.includes('/api/engagement-contracts/'))).toHaveLength(2);
    expect(engagementRequests.some((request) => request.includes('status=draft'))).toBe(true);
  });

  test('New Engagement button navigates to /new route', async ({ ownerPage }) => {
    await ownerPage.goto(ENGAGEMENTS_BASE, { waitUntil: 'domcontentloaded' });

    // Target either the desktop header button or the mobile FAB.
    const newButton = ownerPage.locator('button, a').filter({ hasText: /new engagement/i }).first();
    await newButton.waitFor({ state: 'visible', timeout: 20000 });
    await newButton.click();

    await ownerPage.waitForURL(`**${CREATE_PATH}**`, { timeout: 10000 });
    expect(ownerPage.url()).toContain(CREATE_PATH);
  });

  test('create page renders required sections', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    // h1 — generous timeout absorbs Preact hydration on cold nav.
    await expect(ownerPage.locator('h1').filter({ hasText: 'New Engagement' })).toBeVisible({ timeout: 20000 });

    await expect(ownerPage.getByText(/source intake/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/client & matter/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/scope of representation/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/contract body/i).first()).toBeVisible();
  });

  test('client preview panel visible on desktop viewport', async ({ ownerPage }) => {
    await ownerPage.setViewportSize({ width: 1440, height: 900 });
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    await expect(ownerPage.getByText(/client preview/i)).toBeVisible({ timeout: 20000 });
    await expect(ownerPage.getByText(/engagement agreement/i)).toBeVisible();
  });

  test('billing type radio group is present and selectable', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    // RadioGroupWithDescriptions renders sr-only radio inputs — use radio role to locate them.
    const hourly = ownerPage.getByRole('radio', { name: /hourly/i });
    await expect(hourly).toBeVisible({ timeout: 20000 });
    await expect(ownerPage.getByRole('radio', { name: /fixed fee/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /contingency/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /retainer/i })).toBeVisible();
    await expect(ownerPage.getByRole('radio', { name: /pro bono/i })).toBeVisible();

    // Clicking uses force:true because the input is sr-only and its label intercepts pointer
    // events — we want to trigger the input directly, not via the label overlay.
    const fixedFee = ownerPage.getByRole('radio', { name: /fixed fee/i });
    await fixedFee.click({ force: true });
    await expect(fixedFee).toBeChecked();
    await expect(hourly).not.toBeChecked();

    // Mutual exclusion: switching back unchecks Fixed fee.
    await hourly.click({ force: true });
    await expect(hourly).toBeChecked();
    await expect(fixedFee).not.toBeChecked();
  });

  test('submit without intake shows validation error', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    const submitButton = ownerPage.getByRole('button', { name: /create engagement/i });
    await submitButton.waitFor({ state: 'visible', timeout: 20000 });
    await submitButton.click();

    await expect(ownerPage.getByText(/accepted intake is required/i)).toBeVisible({ timeout: 5000 });
  });

  test('cancel button returns to engagements list', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });

    const cancelButton = ownerPage.getByRole('button', { name: /cancel/i }).first();
    await cancelButton.waitFor({ state: 'visible', timeout: 20000 });
    await cancelButton.click();

    await ownerPage.waitForURL(`**${ENGAGEMENTS_BASE}`, { timeout: 10000 });
    expect(ownerPage.url()).not.toContain('/new');
  });

  test('no horizontal overflow on create page', async ({ ownerPage }) => {
    await ownerPage.goto(CREATE_PATH, { waitUntil: 'domcontentloaded' });
    await ownerPage.waitForLoadState('networkidle').catch(() => undefined);

    const noOverflow = await ownerPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(noOverflow).toBe(true);
  });
});
