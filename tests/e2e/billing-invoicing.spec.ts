import { expect, test } from './fixtures.auth';
import { loadE2EConfig, normalizeE2EPracticeSlug } from './helpers/e2eConfig';
import { fetchJsonViaPage, formatJsonResultError, type JsonResult } from './helpers/http';
import { verifyE2ETestUserEmail } from './helpers/stagingAuthBootstrap';
import { completeStripeHostedInvoicePaymentWithTestCard } from './helpers/stripeCheckout';

type JsonRecord = Record<string, unknown>;
type ApiPage = Parameters<typeof fetchJsonViaPage>[0];
type E2EClientIdentity = {
  email: string;
  userId: string;
};

const e2eConfig = loadE2EConfig();

let PRACTICE_ID = e2eConfig?.practice.id ?? '';
let PRACTICE_SLUG = normalizeE2EPracticeSlug(e2eConfig?.practice.slug, 'demo-owner-local');

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;

const unwrapData = (value: unknown): unknown => {
  const record = asRecord(value);
  if (record && 'data' in record) return unwrapData(record.data);
  return value;
};

const firstRecordFrom = (value: unknown, keys: string[]): JsonRecord | null => {
  const unwrapped = unwrapData(value);
  const record = asRecord(unwrapped);
  if (!record) return null;
  for (const key of keys) {
    const candidate = record[key];
    if (asRecord(candidate)) return candidate as JsonRecord;
    if (Array.isArray(candidate)) {
      const first = candidate.find((item) => asRecord(item));
      if (first) return first as JsonRecord;
    }
  }
  return record;
};

const arrayFrom = (value: unknown, keys: string[]): JsonRecord[] => {
  const unwrapped = unwrapData(value);
  if (Array.isArray(unwrapped)) return unwrapped.filter((item): item is JsonRecord => Boolean(asRecord(item)));
  const record = asRecord(unwrapped);
  if (!record) return [];
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is JsonRecord => Boolean(asRecord(item)));
    }
  }
  return [];
};

const textFrom = (record: JsonRecord | null | undefined, keys: string[]): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
};

const numberFrom = (record: JsonRecord | null | undefined, keys: string[]): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

const booleanFrom = (record: JsonRecord | null | undefined, keys: string[]): boolean | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
};

const requireRecord = (result: JsonResult, keys: string[], label: string): JsonRecord => {
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${label} failed: ${formatJsonResultError(result)}`);
  }
  const record = firstRecordFrom(result.data, keys);
  if (!record) throw new Error(`${label} returned no record: ${JSON.stringify(result.data)}`);
  return record;
};

const requireText = (record: JsonRecord, keys: string[], label: string): string => {
  const value = textFrom(record, keys);
  if (!value) throw new Error(`${label} missing ${keys.join('/')} in ${JSON.stringify(record)}`);
  return value;
};

const userFromSessionPayload = (payload: unknown): JsonRecord | null => {
  const root = asRecord(payload);
  if (!root) return null;
  const directUser = asRecord(root.user);
  if (directUser) return directUser;
  const data = asRecord(root.data);
  return asRecord(data?.user);
};

const findClientByEmail = async (
  ownerPage: ApiPage,
  email: string
): Promise<JsonRecord | null> => {
  const clientList = await api(ownerPage, `/api/clients/${encodeURIComponent(PRACTICE_ID)}?limit=100`);
  const clients = arrayFrom(clientList.data, ['data', 'clients', 'items']);
  return clients.find((item) => {
    const user = asRecord(item.user);
    return textFrom(user, ['email'])?.toLowerCase() === email;
  }) ?? null;
};

const configuredClientIdentityFromSession = async (clientPage: ApiPage): Promise<E2EClientIdentity> => {
  await clientPage.goto('/', { waitUntil: 'domcontentloaded' });
  const clientSession = await api(clientPage, '/api/auth/get-session');
  const user = userFromSessionPayload(clientSession.data);
  return {
    email: requireText(user as JsonRecord, ['email'], 'client session').toLowerCase(),
    userId: requireText(user as JsonRecord, ['id'], 'client session'),
  };
};

const resolveConfiguredClientForPractice = async (
  ownerPage: ApiPage,
  clientPage: ApiPage
): Promise<JsonRecord> => {
  const clientIdentity = await configuredClientIdentityFromSession(clientPage);
  const client = await ensureClientLinkedToPractice(ownerPage, clientPage, clientIdentity.email);
  expect(
    textFrom(asRecord(client.user), ['email'])?.toLowerCase(),
    'linked practice client contact should be the signed-in client account'
  ).toBe(clientIdentity.email);
  const linkedUserId = textFrom(asRecord(client.user), ['id', 'user_id', 'userId'])
    ?? textFrom(client, ['user_id', 'userId']);
  expect(
    linkedUserId,
    'linked practice client contact should point at the signed-in client user id'
  ).toBe(clientIdentity.userId);
  return client;
};

const ensureClientCanAcceptPracticeInvite = async (
  clientPage: ApiPage,
  clientEmail: string
): Promise<void> => {
  const session = await api(clientPage, '/api/auth/get-session');
  const user = userFromSessionPayload(session.data);
  if (booleanFrom(user, ['emailVerified', 'email_verified']) === true) return;

  const verificationResult = await verifyE2ETestUserEmail(clientEmail);
  if (verificationResult.status !== 'verified' && verificationResult.status !== 'already-verified') {
    throw new Error(
      `Client account ${clientEmail} is not email verified, so staging rejects practice invitation acceptance. ` +
      `${verificationResult.message}`
    );
  }

  await expect.poll(async () => {
    const refreshedSession = await api(clientPage, '/api/auth/get-session');
    const refreshedUser = userFromSessionPayload(refreshedSession.data);
    return booleanFrom(refreshedUser, ['emailVerified', 'email_verified']);
  }, {
    timeout: 15000,
    intervals: [500, 1000, 2000],
    message: 'client session should reflect verified email before accepting the practice invitation',
  }).toBe(true);
};

const ensureClientLinkedToPractice = async (
  ownerPage: ApiPage,
  clientPage: ApiPage,
  clientEmail: string
): Promise<JsonRecord> => {
  const existingClient = await findClientByEmail(ownerPage, clientEmail);
  if (existingClient) return existingClient;

  await ensureClientCanAcceptPracticeInvite(clientPage, clientEmail);

  const invitation = await api(ownerPage, '/api/auth/organization/invite-member', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: clientEmail,
      role: 'client',
      organizationId: PRACTICE_ID,
    }),
  });
  const invitationRecord = firstRecordFrom(invitation.data, ['invitation', 'data']) ?? asRecord(invitation.data);
  const invitationId = textFrom(invitationRecord, ['invitationId', 'id']);
  if (invitationId) {
    await api(clientPage, '/api/auth/organization/accept-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId }),
    });
    await api(clientPage, '/api/auth/organization/set-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: PRACTICE_ID }),
    }).catch(() => undefined);
  }

  await expect.poll(async () => {
    return Boolean(await findClientByEmail(ownerPage, clientEmail));
  }, {
    timeout: 30000,
    intervals: [1000, 2000, 5000],
    message: 'invited client should appear in the practice contacts list',
  }).toBe(true);

  const linkedClient = await findClientByEmail(ownerPage, clientEmail);
  if (!linkedClient) {
    throw new Error(`Invited client ${clientEmail} was not returned by /api/clients/${PRACTICE_ID}.`);
  }
  return linkedClient;
};

const addDays = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const retryDelayFromRateLimit = (result: JsonResult): number | null => {
  if (result.status !== 429) return null;
  const retryAfterMatch = result.error?.match(/"retry_after"\s*:\s*(\d+)/i);
  const retryAfterSeconds = retryAfterMatch ? Number.parseInt(retryAfterMatch[1], 10) : 4;
  return (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 4) * 1000 + 250;
};

const api = async (page: ApiPage, url: string, init?: Parameters<typeof fetchJsonViaPage>[2]) => {
  let result = await fetchJsonViaPage(page, url, init);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retryDelayMs = retryDelayFromRateLimit(result);
    if (retryDelayMs === null) break;
    await sleep(retryDelayMs);
    result = await fetchJsonViaPage(page, url, init);
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`API ${init?.method ?? 'GET'} ${url} failed: ${formatJsonResultError(result)}`);
  }
  return result;
};

const resolveOwnerPracticeContext = async (ownerPage: ApiPage) => {
  const practiceList = await api(ownerPage, '/api/practice/list');
  const practices = arrayFrom(practiceList.data, ['practices', 'data', 'items']);
  const practice = practices.find((item) => textFrom(item, ['slug']) === PRACTICE_SLUG)
    ?? practices.find((item) => textFrom(item, ['id']) === PRACTICE_ID);
  if (!practice) {
    throw new Error(
      `Configured owner account is not linked to practice ${PRACTICE_SLUG || PRACTICE_ID}. ` +
      `Available practices: ${JSON.stringify(practices.map((item) => ({
        id: textFrom(item, ['id']),
        slug: textFrom(item, ['slug']),
      })))}`
    );
  }
  PRACTICE_ID = requireText(practice, ['id'], 'owner practice');
  PRACTICE_SLUG = requireText(practice, ['slug'], 'owner practice');
};

type PracticeBillingScenario = {
  clientId: string;
  clientEmail: string;
  invoiceId: string;
  matterId: string;
  hostedInvoiceUrl: string | null;
  matterTitle: string;
  noteText: string;
  timeDescription: string;
  expenseDescription: string;
  clientInvoiceNote: string;
  internalMemo: string;
};

const createPracticeBillingScenario = async (
  ownerPage: ApiPage,
  client: JsonRecord,
  unique: string,
  options: { sendInvoice?: boolean } = {}
): Promise<PracticeBillingScenario> => {
  const matterTitle = `E2E billing matter ${unique}`;
  const noteText = `E2E billing note ${unique}`;
  const timeDescription = `Draft demand letter ${unique}`;
  const expenseDescription = `Court filing expense ${unique}`;
  const clientInvoiceNote = `Please pay this E2E invoice ${unique}`;
  const internalMemo = `Owner-only memo ${unique}`;
  const clientId = requireText(client, ['id'], 'client record');
  const clientEmail = requireText(asRecord(client.user) ?? {}, ['email'], 'client record user');

  const onboarding = await api(ownerPage, `/api/onboarding/organization/${encodeURIComponent(PRACTICE_ID)}/status`);
  const onboardingRecord = firstRecordFrom(onboarding.data, ['data', 'status']) ?? asRecord(onboarding.data);
  const connectedAccountId = textFrom(onboardingRecord, ['connected_account_id', 'connectedAccountId']);
  if (!connectedAccountId) {
    throw new Error('Practice Stripe connected account is required before invoices can be sent.');
  }

  const matter = requireRecord(await api(ownerPage, `/api/matters/${encodeURIComponent(PRACTICE_ID)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: matterTitle,
      client_id: clientId,
      description: 'E2E billing happy-path matter for invoice payment verification.',
      billing_type: 'hourly',
      status: 'active',
      matter_type: 'Contract dispute',
      urgency: 'routine',
      attorney_hourly_rate: 12500,
      admin_hourly_rate: 7500,
      open_date: addDays(0),
    }),
  }), ['matter'], 'create matter');
  const matterId = requireText(matter, ['id'], 'created matter');
  expect(textFrom(matter, ['client_id'])).toBe(clientId);

  const note = requireRecord(await api(ownerPage, `/api/matters/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(matterId)}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: noteText }),
  }), ['note', 'notes'], 'create matter note');
  expect(requireText(note, ['id'], 'created note')).toBeTruthy();

  const start = new Date();
  start.setUTCHours(15, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMinutes(end.getUTCMinutes() + 60);
  const timeEntry = requireRecord(await api(ownerPage, `/api/matters/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(matterId)}/time-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: timeDescription,
      billable: true,
    }),
  }), ['timeEntry', 'time_entries', 'timeEntries'], 'create matter time entry');
  const timeEntryId = requireText(timeEntry, ['id'], 'created time entry');

  const expense = requireRecord(await api(ownerPage, `/api/matters/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(matterId)}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: expenseDescription,
      amount: 3210,
      date: addDays(0),
      billable: true,
    }),
  }), ['expense', 'expenses'], 'create matter expense');
  const expenseId = requireText(expense, ['id'], 'created expense');

  const invoice = requireRecord(await api(ownerPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      matter_id: matterId,
      connected_account_id: connectedAccountId,
      invoice_type: 'flat_fee',
      due_date: addDays(1),
      notes: clientInvoiceNote,
      memo: internalMemo,
      line_items: [
        {
          type: 'time_entry',
          description: timeDescription,
          quantity: 1,
          unit_price: 12500,
          time_entry_id: timeEntryId,
          sort_order: 0,
        },
        {
          type: 'expense',
          description: expenseDescription,
          quantity: 1,
          unit_price: 3210,
          expense_id: expenseId,
          sort_order: 1,
        },
        {
          type: 'service',
          description: 'Invoice preparation and delivery',
          quantity: 1,
          unit_price: 1500,
          sort_order: 2,
        },
      ],
    }),
  }), ['invoice', 'invoices'], 'create invoice');
  const invoiceId = requireText(invoice, ['id'], 'created invoice');
  expect(textFrom(invoice, ['matter_id'])).toBe(matterId);
  expect(numberFrom(invoice, ['total']), 'created invoice should have a positive total').toBeGreaterThan(0);

  let hostedInvoiceUrl: string | null = null;
  let ownerInvoiceDetail: JsonRecord | null = null;
  if (options.sendInvoice) {
    const sentInvoice = requireRecord(await api(ownerPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(invoiceId)}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }), ['invoice', 'invoices'], 'send invoice');
    expect(['sent', 'open', 'pending'].includes((textFrom(sentInvoice, ['status']) ?? '').toLowerCase())).toBe(true);

    await expect.poll(async () => {
      const detail = await api(ownerPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(invoiceId)}`);
      const detailRecord = firstRecordFrom(detail.data, ['invoice', 'invoices']);
      ownerInvoiceDetail = detailRecord;
      hostedInvoiceUrl = textFrom(detailRecord, ['stripe_hosted_invoice_url', 'stripeHostedInvoiceUrl']);
      return hostedInvoiceUrl;
    }, {
      timeout: 60000,
      intervals: [1000, 2000, 5000],
      message: 'sent invoice should expose a Stripe hosted invoice URL',
    }).toMatch(/^https:\/\/invoice\.stripe\.com\//);
    if (!hostedInvoiceUrl) {
      throw new Error(`Invoice ${invoiceId} did not expose a Stripe hosted invoice URL.`);
    }
  } else {
    const detail = await api(ownerPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(invoiceId)}`);
    ownerInvoiceDetail = firstRecordFrom(detail.data, ['invoice', 'invoices']);
    expect(textFrom(ownerInvoiceDetail, ['status'])?.toLowerCase()).toBe('draft');
  }
  if (!ownerInvoiceDetail) {
    throw new Error(`Invoice ${invoiceId} did not expose owner detail.`);
  }
  expect(textFrom(ownerInvoiceDetail, ['notes']), 'owner detail should retain client-visible notes').toBe(clientInvoiceNote);
  expect(textFrom(ownerInvoiceDetail, ['memo']), 'owner detail should retain the internal memo').toBe(internalMemo);
  const ownerLineDescriptions = arrayFrom(ownerInvoiceDetail, ['line_items', 'lineItems'])
    .map((item) => textFrom(item, ['description']));
  expect(ownerLineDescriptions).toContain(timeDescription);
  expect(ownerLineDescriptions).toContain(expenseDescription);

  return {
    clientId,
    clientEmail,
    invoiceId,
    matterId,
    hostedInvoiceUrl,
    matterTitle,
    noteText,
    timeDescription,
    expenseDescription,
    clientInvoiceNote,
    internalMemo,
  };
};

const verifyPracticeBillingScenarioInOwnerUi = async (
  ownerPage: ApiPage,
  scenario: PracticeBillingScenario
): Promise<void> => {
  await ownerPage.goto(`/practice/${encodeURIComponent(PRACTICE_SLUG)}/invoices/${encodeURIComponent(scenario.invoiceId)}`, { waitUntil: 'domcontentloaded' });
  await expect(ownerPage.getByText(scenario.matterTitle).first()).toBeVisible({ timeout: 30000 });
  await expect(ownerPage.getByText(scenario.clientInvoiceNote).first()).toBeVisible();
  await expect(ownerPage.getByText(scenario.timeDescription).first()).toBeVisible();
  await expect(ownerPage.getByText(scenario.expenseDescription).first()).toBeVisible();
};

const verifyFinalOwnerMatterState = async (
  ownerPage: ApiPage,
  scenario: PracticeBillingScenario
): Promise<void> => {
  const finalOwnerMatter = await api(ownerPage, `/api/matters/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(scenario.matterId)}`);
  expect(textFrom(firstRecordFrom(finalOwnerMatter.data, ['matter']), ['id'])).toBe(scenario.matterId);
  const finalNotes = await api(ownerPage, `/api/matters/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(scenario.matterId)}/notes`);
  expect(arrayFrom(finalNotes.data, ['notes']).some((item) => textFrom(item, ['content']) === scenario.noteText)).toBe(true);
};

const prepareOwnerPage = async (ownerPage: ApiPage): Promise<void> => {
  await ownerPage.goto('/', { waitUntil: 'domcontentloaded' });
  await resolveOwnerPracticeContext(ownerPage);
  await ownerPage.goto(`/practice/${encodeURIComponent(PRACTICE_SLUG)}/invoices`, { waitUntil: 'domcontentloaded' });

  await api(ownerPage, '/api/auth/organization/set-active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId: PRACTICE_ID }),
  });
  const session = await api(ownerPage, '/api/auth/get-session');
  const activeOrgId = textFrom(asRecord(session.data)?.session as JsonRecord | undefined, ['activeOrganizationId', 'active_organization_id']);
  expect(activeOrgId, 'owner session should carry the configured practice as active organization').toBe(PRACTICE_ID);
};

test.describe('billing and invoicing happy path', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 240000 });

  test('practice owner creates matter work and a draft invoice for the configured client', async ({ ownerPage, clientPage }) => {
    if (!e2eConfig) return;

    await prepareOwnerPage(ownerPage);
    const client = await resolveConfiguredClientForPractice(ownerPage, clientPage);
    const scenario = await createPracticeBillingScenario(ownerPage, client, `billing-owner-e2e-${Date.now()}`);

    await verifyPracticeBillingScenarioInOwnerUi(ownerPage, scenario);
    await verifyFinalOwnerMatterState(ownerPage, scenario);
  });

  test('client receives and pays hosted invoice', async ({ ownerPage, clientPage }) => {
    if (!e2eConfig) return;

    await prepareOwnerPage(ownerPage);
    const client = await resolveConfiguredClientForPractice(ownerPage, clientPage);
    const scenario = await createPracticeBillingScenario(ownerPage, client, `billing-client-e2e-${Date.now()}`, { sendInvoice: true });
    expect(scenario.hostedInvoiceUrl, 'sent invoice should expose a hosted Stripe invoice URL').toMatch(/^https:\/\/invoice\.stripe\.com\//);

    const clientInvoices = await api(clientPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}/client`);
    const clientInvoiceRecord = arrayFrom(clientInvoices.data, ['invoices', 'items', 'data'])
      .find((item) => textFrom(item, ['id']) === scenario.invoiceId);
    expect(clientInvoiceRecord, 'client invoice list should include the exact sent invoice').toBeTruthy();
    expect(textFrom(clientInvoiceRecord, ['client_id', 'clientId']), 'client invoice list should belong to the configured client').toBe(scenario.clientId);

    const clientInvoiceDetail = requireRecord(
      await api(clientPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}/client/${encodeURIComponent(scenario.invoiceId)}`),
      ['invoice', 'invoices'],
      'load client invoice detail'
    );
    expect(textFrom(clientInvoiceDetail, ['id']), 'client detail should be the exact sent invoice').toBe(scenario.invoiceId);
    expect(textFrom(clientInvoiceDetail, ['client_id', 'clientId']), 'client detail should belong to the configured client').toBe(scenario.clientId);
    expect(textFrom(clientInvoiceDetail, ['stripe_hosted_invoice_url', 'stripeHostedInvoiceUrl']), 'client detail should expose the same hosted invoice URL the owner sent').toBe(scenario.hostedInvoiceUrl);
    expect(textFrom(clientInvoiceDetail, ['notes']), 'client detail should expose client-visible notes').toBe(scenario.clientInvoiceNote);
    expect(textFrom(clientInvoiceDetail, ['memo']), 'client detail must not leak owner-only memo').not.toBe(scenario.internalMemo);
    const clientLineDescriptions = arrayFrom(clientInvoiceDetail, ['line_items', 'lineItems'])
      .map((item) => textFrom(item, ['description']));
    expect(clientLineDescriptions).toContain(scenario.timeDescription);
    expect(clientLineDescriptions).toContain(scenario.expenseDescription);

    await verifyPracticeBillingScenarioInOwnerUi(ownerPage, scenario);

    await clientPage.goto(`/client/${encodeURIComponent(PRACTICE_SLUG)}/invoices/${encodeURIComponent(scenario.invoiceId)}`, { waitUntil: 'domcontentloaded' });
    await expect(clientPage.getByRole('button', { name: /^pay$/i })).toBeVisible({ timeout: 30000 });
    await expect(clientPage.getByText(scenario.clientEmail).first()).toBeVisible();
    await expect(clientPage.getByText(scenario.clientInvoiceNote).first()).toBeVisible();
    await expect(clientPage.getByText(scenario.timeDescription).first()).toBeVisible();
    await expect(clientPage.getByText(scenario.expenseDescription).first()).toBeVisible();
    await expect(clientPage.getByText(scenario.internalMemo)).not.toBeVisible();

    const popupPromise = clientPage.waitForEvent('popup');
    await clientPage.getByRole('button', { name: /^pay$/i }).click();
    const stripePage = await popupPromise;
    const hostedInvoiceUrl = requireText({ hostedInvoiceUrl: scenario.hostedInvoiceUrl }, ['hostedInvoiceUrl'], 'sent invoice');
    await stripePage.waitForURL((url) => url.toString().startsWith(hostedInvoiceUrl), { timeout: 30000 });
    expect(stripePage.url(), 'client Pay should open the exact hosted invoice URL returned for this invoice').toContain(hostedInvoiceUrl);
    await completeStripeHostedInvoicePaymentWithTestCard(stripePage);
    await stripePage.close().catch(() => undefined);

    await expect.poll(async () => {
      await api(ownerPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(scenario.invoiceId)}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => undefined);
      const detail = await api(ownerPage, `/api/invoices/${encodeURIComponent(PRACTICE_ID)}/${encodeURIComponent(scenario.invoiceId)}`);
      const record = firstRecordFrom(detail.data, ['invoice', 'invoices']);
      const status = textFrom(record, ['status'])?.toLowerCase();
      const amountDue = numberFrom(record, ['amount_due', 'amountDue']);
      const amountPaid = numberFrom(record, ['amount_paid', 'amountPaid']);
      return status === 'paid' && amountDue === 0 && amountPaid !== null && amountPaid > 0 && Boolean(textFrom(record, ['paid_at', 'paidAt']));
    }, {
      timeout: 90000,
      intervals: [2000, 5000, 10000],
      message: 'invoice should sync to paid after client Stripe payment',
    }).toBe(true);

    await clientPage.goto(`/client/${encodeURIComponent(PRACTICE_SLUG)}/invoices/${encodeURIComponent(scenario.invoiceId)}`, { waitUntil: 'domcontentloaded' });
    await expect(clientPage.getByText(/paid/i).first()).toBeVisible({ timeout: 30000 });
    await expect(clientPage.getByRole('button', { name: /^pay$/i })).not.toBeVisible();

    await ownerPage.goto(`/practice/${encodeURIComponent(PRACTICE_SLUG)}/invoices/${encodeURIComponent(scenario.invoiceId)}`, { waitUntil: 'domcontentloaded' });
    await expect(ownerPage.getByText(/paid/i).first()).toBeVisible({ timeout: 30000 });
    await verifyFinalOwnerMatterState(ownerPage, scenario);
  });
});
