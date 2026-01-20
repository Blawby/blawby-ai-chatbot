import { expect, test } from './fixtures';
import type { APIRequestContext, APIResponse, BrowserContext } from '@playwright/test';
import { randomUUID } from 'crypto';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();
const BACKEND_API_URL = process.env.E2E_BACKEND_API_URL || 'https://staging-api.blawby.com';
if (!process.env.E2E_BACKEND_API_URL) {
  console.warn('E2E_BACKEND_API_URL is not set; defaulting to https://staging-api.blawby.com.');
}
const PAYMENT_MODE = (process.env.E2E_PAYMENT_MODE || 'auto').toLowerCase();
const normalizeWorkerBaseUrl = (value: string): string => value.replace(/\/api\/?$/, '');
const WORKER_API_URL = normalizeWorkerBaseUrl(
  process.env.E2E_WORKER_URL || process.env.VITE_WORKER_API_URL || 'http://localhost:8787'
);

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
}

interface IntakeSettings {
  paymentLinkEnabled?: boolean;
  prefillAmount?: number;
  connectedAccount?: {
    id?: string;
    chargesEnabled?: boolean;
  };
}

type ConnectedAccountPayload = {
  id?: string;
  chargesEnabled?: boolean;
  charges_enabled?: boolean;
};

interface IntakeCreateResult {
  uuid?: string;
  clientSecret?: string;
  paymentLinkUrl?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const buildCookieHeader = async (context: BrowserContext, baseURL: string): Promise<string> => {
  const cookies = await context.cookies(baseURL);
  if (!cookies.length) return '';
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

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

type IntakeSettingsResult = {
  settings: IntakeSettings | null;
  status: number;
  errorText?: string;
};

type PracticeSummary = {
  id?: string;
  slug?: string;
};

type LeadQueueItem = {
  id?: string;
  status?: string;
};

const extractPracticeList = (payload: unknown): PracticeSummary[] => {
  if (Array.isArray(payload)) return payload as PracticeSummary[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.practices)) return record.practices as PracticeSummary[];
  if (Array.isArray(record.data)) return record.data as PracticeSummary[];
  if (record.data && typeof record.data === 'object') {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.practices)) return nested.practices as PracticeSummary[];
    if (Array.isArray(nested.items)) return nested.items as PracticeSummary[];
  }
  return [];
};

const resolvePracticeId = async (
  request: APIRequestContext,
  practiceSlug: string,
  fallbackId: string
): Promise<string> => {
  const response = await request.get('/api/practice/list', {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok()) {
    throw new Error(`Failed to load practice list: ${response.status()} ${response.statusText()}`);
  }
  const payload = await response.json().catch(() => null);
  const practices = extractPracticeList(payload);
  const match = practices.find((practice) => practice?.slug === practiceSlug || practice?.id === fallbackId);
  if (!match?.id) {
    throw new Error(`Practice slug ${practiceSlug} not found for owner; check e2e credentials.`);
  }
  return match.id;
};

const getLeadQueue = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
}): Promise<LeadQueueItem[]> => {
  const cookieHeader = await buildCookieHeader(options.context, options.baseURL);
  const url = `${WORKER_API_URL}/api/practices/${encodeURIComponent(options.practiceId)}/workspace/matters?status=lead`;
  const response = await options.request.get(url, {
    headers: {
      Accept: 'application/json',
      Cookie: cookieHeader
    }
  });
  if (!response.ok()) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Failed to fetch lead queue: ${response.status()} ${bodyText}`);
  }
  const payload = await response.json().catch(() => null) as {
    data?: { items?: LeadQueueItem[]; matters?: LeadQueueItem[] };
  } | null;
  const items = payload?.data?.items ?? payload?.data?.matters ?? [];
  return items;
};

const getIntakeSettings = async (
  slug: string,
  request?: APIRequestContext
): Promise<IntakeSettingsResult> => {
  const normalizedSlug = normalizePracticeSlug(slug);
  const url = `${BACKEND_API_URL}/api/practice/client-intakes/${encodeURIComponent(normalizedSlug)}/intake`;
  const response = request
    ? await request.get(url, { headers: { Accept: 'application/json' } })
    : await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

  const ok = typeof response.ok === 'function' ? response.ok() : response.ok;
  const status = typeof response.status === 'function' ? response.status() : response.status;
  if (!ok) {
    const errorText = await response.text().catch(() => '');
    return { settings: null, status, errorText };
  }

  const payload = await response.json().catch(() => null) as
    | {
        data?: {
          settings?: IntakeSettings;
          connectedAccount?: ConnectedAccountPayload;
          connected_account?: ConnectedAccountPayload;
        };
        settings?: IntakeSettings;
        connectedAccount?: ConnectedAccountPayload;
        connected_account?: ConnectedAccountPayload;
      }
    | null;
  const data = payload?.data ?? payload ?? null;
  if (!data?.settings) {
    return { settings: null, status };
  }

  const connectedAccount: ConnectedAccountPayload | undefined = data.connectedAccount ?? data.connected_account ?? undefined;
  return {
    status,
    settings: {
      ...data.settings,
      connectedAccount: connectedAccount
        ? {
            id: connectedAccount.id,
            chargesEnabled: connectedAccount.chargesEnabled ?? connectedAccount.charges_enabled
          }
        : undefined
    }
  };
};

const createIntake = async (options: {
  slug: string;
  name: string;
  email: string;
  description?: string;
  amount?: number;
  request?: APIRequestContext;
  origin?: string;
}): Promise<IntakeCreateResult> => {
  const normalizedSlug = normalizePracticeSlug(options.slug);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.origin) {
    headers.Origin = options.origin;
    headers.Referer = `${options.origin}/`;
  }
  const payload = {
    slug: normalizedSlug,
    amount: typeof options.amount === 'number' ? Math.max(options.amount, 50) : 50,
    name: options.name,
    email: options.email,
    description: options.description,
  };
  const url = `${BACKEND_API_URL}/api/practice/client-intakes/create`;

  const response = options.request
    ? await options.request.post(url, { data: payload, headers })
    : await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload)
    });

  const ok = typeof response.ok === 'function' ? response.ok() : response.ok;
  const status = typeof response.status === 'function' ? response.status() : response.status;
  if (!ok) {
    const text = await response.text();
    throw new Error(`Intake create failed (${status}): ${text}`);
  }

  const responsePayload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!responsePayload) {
    throw new Error('Intake create returned empty response');
  }
  if (responsePayload.success === false) {
    const errorValue = responsePayload.error;
    const errorMessage = typeof errorValue === 'string'
      ? errorValue
      : typeof (errorValue as { message?: string } | null)?.message === 'string'
        ? (errorValue as { message?: string }).message
        : 'Intake create returned success=false';
    throw new Error(errorMessage);
  }

  const data = (responsePayload.data && typeof responsePayload.data === 'object')
    ? responsePayload.data as Record<string, unknown>
    : responsePayload;
  return {
    uuid: typeof data.uuid === 'string' ? data.uuid : undefined,
    clientSecret: typeof data.client_secret === 'string' ? data.client_secret : undefined,
    paymentLinkUrl: typeof data.payment_link_url === 'string'
      ? data.payment_link_url
      : typeof data.paymentLinkUrl === 'string'
        ? data.paymentLinkUrl
        : undefined,
    amount: typeof data.amount === 'number' ? data.amount : undefined,
    currency: typeof data.currency === 'string' ? data.currency : undefined,
    status: typeof data.status === 'string' ? data.status : undefined
  };
};

type ConfirmResponse = {
  status: number;
  data?: { matterId?: string };
  error?: string;
  url?: string;
  rawText?: string;
};

const parseConfirmResponse = async (response: APIResponse): Promise<ConfirmResponse> => {
  const status = response.status();
  const url = response.url();
  const rawText = await response.text().catch(() => '');
  let data: { matterId?: string } | undefined;
  let error: string | undefined;
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as { data?: { matterId?: string }; error?: string };
      data = parsed.data;
      if (typeof parsed.error === 'string') {
        error = parsed.error;
      }
    } catch {
      // Leave data undefined when response body is not JSON.
    }
  }
  return { status, data, error, url, rawText };
};

const confirmIntakeLead = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
  practiceSlug: string;
  intakeUuid: string;
  conversationId: string;
}): Promise<{ status: number; data?: { matterId?: string } } > => {
  const params = new URLSearchParams({ practiceId: options.practiceId });
  if (options.practiceSlug) {
    params.set('practiceSlug', options.practiceSlug);
  }
  const path = `/api/intakes/confirm?${params.toString()}`;
  const payload = {
    intakeUuid: options.intakeUuid,
    conversationId: options.conversationId
  };

  const initial = await parseConfirmResponse(await options.request.post(path, { data: payload }));
  if (initial.status !== 404) {
    return { status: initial.status, data: initial.data };
  }

  const cookieHeader = await buildCookieHeader(options.context, options.baseURL);
  if (!cookieHeader) {
    console.warn('[E2E] Intake confirm returned 404 with empty cookie jar; skipping worker retry.');
    return { status: initial.status, data: initial.data };
  }

  console.warn(
    `[E2E] Intake confirm returned 404 from ${initial.url}; retrying via worker ${WORKER_API_URL}.`
  );

  let retry = await parseConfirmResponse(await options.request.post(`${WORKER_API_URL}${path}`, {
    data: payload,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader
    }
  }));

  if (retry.status === 404 && retry.error?.toLowerCase().includes('intake not found')) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await sleep(500 * (attempt + 1));
      retry = await parseConfirmResponse(await options.request.post(`${WORKER_API_URL}${path}`, {
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader
        }
      }));
      if (retry.status !== 404) {
        break;
      }
    }
  }

  if (retry.status === 404) {
    console.warn('[E2E] Intake confirm still returning 404:', retry.error || retry.rawText || 'no body');
  }

  return { status: retry.status, data: retry.data };
};

const getOrCreateConversation = async (request: APIRequestContext, practiceId: string) => {
  const response = await request.get(
    `/api/conversations/active?practiceId=${encodeURIComponent(practiceId)}`,
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  const rawText = await response.text().catch(() => '');
  let data: { data?: { conversation?: { id?: string } } } | null = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as { data?: { conversation?: { id?: string } } };
    } catch {
      data = null;
    }
  }
  if (!response.ok() || !data?.data?.conversation?.id) {
    const fallbackText = data ? JSON.stringify(data) : rawText;
    throw new Error(
      `Failed to create conversation: ${response.status()} (${response.url()}) ${fallbackText.slice(0, 300)}`
    );
  }

  return data.data.conversation.id as string;
};

const getConversationMessages = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
  conversationId: string;
}) => {
  const cookieHeader = await buildCookieHeader(options.context, options.baseURL);
  const url = `${WORKER_API_URL}/api/chat/messages?practiceId=${encodeURIComponent(options.practiceId)}&conversationId=${encodeURIComponent(options.conversationId)}&limit=50`;
  const response = await options.request.get(url, {
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader
    }
  });

  const data = await response.json().catch(() => null) as { data?: { messages?: ConversationMessage[] } } | null;
  if (!response.ok() || !data?.data?.messages) {
    throw new Error(`Failed to fetch messages: ${response.status()}`);
  }

  return data.data.messages as ConversationMessage[];
};

const waitForDecisionMessage = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
  conversationId: string;
  decision: 'accepted' | 'rejected';
  timeoutMs?: number;
}) => {
  const { request, context, baseURL, practiceId, conversationId, decision, timeoutMs = 15000 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const messages = await getConversationMessages({
      request,
      context,
      baseURL,
      practiceId,
      conversationId
    });
    const match = messages.find(message => message.metadata?.intakeDecision === decision);
    if (match) return match;
    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${decision} intake decision message`);
};

const shouldRunPaymentMode = (required: boolean): boolean => {
  if (PAYMENT_MODE === 'paid') return required;
  if (PAYMENT_MODE === 'free') return !required;
  return true;
};

const formatIntakeSettingsSkip = (result: IntakeSettingsResult): string => {
  const detail = result.errorText
    ? ` ${result.errorText.slice(0, 200)}`
    : '';
  return `Skipping intake flow: unable to load intake settings from ${BACKEND_API_URL} (status ${result.status}).${detail}`;
};

test.describe('Lead intake workflow', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });
  test.skip(!e2eConfig, 'E2E credentials are not configured.');

  test('owner accepts lead for signed-in client (no payment required)', async ({
    baseURL,
    ownerContext,
    clientContext,
    ownerPage,
    clientPage
  }) => {
    if (!e2eConfig) return;

    const intakeSettingsResult = await getIntakeSettings(e2eConfig.practice.slug, ownerContext.request);
    if (!intakeSettingsResult.settings) {
      const message = formatIntakeSettingsSkip(intakeSettingsResult);
      console.warn(message);
      test.skip(true, message);
    }
    const intakeSettings = intakeSettingsResult.settings;
    const paymentRequired = intakeSettings?.paymentLinkEnabled === true;
    if (paymentRequired) {
      test.skip(true, 'Skipping free intake test: practice requires payment.');
    }
    if (!shouldRunPaymentMode(false)) {
      test.skip(true, `Skipping free intake test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    await clientPage.goto('/');
    await waitForSession(clientPage, { timeoutMs: 30000 });

    const practiceId = await resolvePracticeId(ownerContext.request, e2eConfig.practice.slug, e2eConfig.practice.id);
    const conversationId = await getOrCreateConversation(clientContext.request, practiceId);
    const clientName = `E2E Client ${randomUUID().slice(0, 6)}`;

    const intake = await createIntake({
      slug: e2eConfig.practice.slug,
      name: clientName,
      email: e2eConfig.client.email,
      description: 'E2E accept flow',
      amount: intakeSettings?.prefillAmount,
      request: clientContext.request,
      origin: baseURL
    });

    if (!intake.uuid) {
      throw new Error('Intake create did not return uuid');
    }

    const confirmResult = await confirmIntakeLead({
      request: clientContext.request,
      context: clientContext,
      baseURL,
      practiceId,
      practiceSlug: e2eConfig.practice.slug,
      intakeUuid: intake.uuid,
      conversationId
    });

    expect(confirmResult.status).toBe(200);
    const matterId = confirmResult.data?.matterId;
    if (!matterId) {
      throw new Error('Intake confirm did not return matterId');
    }

    await ownerPage.goto('/practice/leads');
    const leadCard = ownerPage.getByTestId(`lead-card-${matterId}`);
    await expect(leadCard).toBeVisible({ timeout: 20000 });

    const acceptUrlFragment = `/api/practices/${encodeURIComponent(practiceId)}/workspace/matters/${encodeURIComponent(matterId)}/accept`;
    const acceptResponsePromise = ownerPage.waitForResponse((response) => (
      response.request().method() === 'POST' && response.url().includes(acceptUrlFragment)
    ), { timeout: 15000 });

    await ownerPage.getByTestId(`lead-accept-${matterId}`).click();
    await ownerPage.getByRole('button', { name: 'Accept Lead' }).click();

    const acceptResponse = await acceptResponsePromise;
    if (!acceptResponse.ok()) {
      const bodyText = await acceptResponse.text().catch(() => '');
      throw new Error(`Accept lead failed: ${acceptResponse.status()} ${bodyText}`);
    }

    const leadQueue = await getLeadQueue({
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      practiceId
    });
    if (leadQueue.some((lead) => lead.id === matterId)) {
      throw new Error(`Lead ${matterId} still returned in API queue after accept.`);
    }

    const decisionMessage = await waitForDecisionMessage({
      request: clientContext.request,
      context: clientContext,
      baseURL,
      practiceId,
      conversationId,
      decision: 'accepted'
    });

    expect(decisionMessage.content.toLowerCase()).toContain('accepted');
  });

  test('owner rejects lead for anonymous guest (no payment required)', async ({
    baseURL,
    ownerContext,
    anonContext,
    ownerPage,
    anonPage
  }) => {
    if (!e2eConfig) return;

    const intakeSettingsResult = await getIntakeSettings(e2eConfig.practice.slug, ownerContext.request);
    if (!intakeSettingsResult.settings) {
      const message = formatIntakeSettingsSkip(intakeSettingsResult);
      console.warn(message);
      test.skip(true, message);
    }
    const intakeSettings = intakeSettingsResult.settings;
    const paymentRequired = intakeSettings?.paymentLinkEnabled === true;
    if (paymentRequired) {
      test.skip(true, 'Skipping free intake test: practice requires payment.');
    }
    if (!shouldRunPaymentMode(false)) {
      test.skip(true, `Skipping free intake test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    await anonPage.goto(`/p/${encodeURIComponent(e2eConfig.practice.slug)}`);
    await waitForSession(anonPage, { timeoutMs: 30000 });

    const practiceId = await resolvePracticeId(ownerContext.request, e2eConfig.practice.slug, e2eConfig.practice.id);
    const conversationId = await getOrCreateConversation(anonContext.request, practiceId);
    const intakeUuid = randomUUID();
    const clientName = `E2E Guest ${intakeUuid.slice(0, 8)}`;
    const rejectReason = `Conflict check ${intakeUuid.slice(0, 4)}`;

    const intake = await createIntake({
      slug: e2eConfig.practice.slug,
      name: clientName,
      email: `guest+${intakeUuid.slice(0, 6)}@example.com`,
      description: 'E2E reject flow',
      amount: intakeSettings?.prefillAmount,
      request: anonContext.request,
      origin: baseURL
    });

    if (!intake.uuid) {
      throw new Error('Intake create did not return uuid');
    }

    const confirmResult = await confirmIntakeLead({
      request: anonContext.request,
      context: anonContext,
      baseURL,
      practiceId,
      practiceSlug: e2eConfig.practice.slug,
      intakeUuid: intake.uuid,
      conversationId
    });

    expect(confirmResult.status).toBe(200);
    const matterId = confirmResult.data?.matterId;
    if (!matterId) {
      throw new Error('Intake confirm did not return matterId');
    }

    await ownerPage.goto('/practice/leads');
    const leadCard = ownerPage.getByTestId(`lead-card-${matterId}`);
    await expect(leadCard).toBeVisible({ timeout: 20000 });

    const rejectUrlFragment = `/api/practices/${encodeURIComponent(practiceId)}/workspace/matters/${encodeURIComponent(matterId)}/reject`;
    const rejectResponsePromise = ownerPage.waitForResponse((response) => (
      response.request().method() === 'POST' && response.url().includes(rejectUrlFragment)
    ), { timeout: 15000 });

    await ownerPage.getByTestId(`lead-reject-${matterId}`).click();
    await ownerPage.fill('#lead-reject-reason', rejectReason);
    await ownerPage.getByRole('button', { name: 'Reject Lead' }).click();

    const rejectResponse = await rejectResponsePromise;
    if (!rejectResponse.ok()) {
      const bodyText = await rejectResponse.text().catch(() => '');
      throw new Error(`Reject lead failed: ${rejectResponse.status()} ${bodyText}`);
    }

    const leadQueue = await getLeadQueue({
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      practiceId
    });
    if (leadQueue.some((lead) => lead.id === matterId)) {
      throw new Error(`Lead ${matterId} still returned in API queue after reject.`);
    }

    const decisionMessage = await waitForDecisionMessage({
      request: anonContext.request,
      context: anonContext,
      baseURL,
      practiceId,
      conversationId,
      decision: 'rejected'
    });

    expect(decisionMessage.content.toLowerCase()).toContain('declined');
    expect(decisionMessage.content).toContain(rejectReason);
  });

  test('payment-required intake is gated until completion', async ({
    baseURL,
    clientContext,
    clientPage,
    ownerContext
  }) => {
    if (!e2eConfig) return;

    const intakeSettingsResult = await getIntakeSettings(e2eConfig.practice.slug, clientContext.request);
    if (!intakeSettingsResult.settings) {
      const message = formatIntakeSettingsSkip(intakeSettingsResult);
      console.warn(message);
      test.skip(true, message);
    }
    const intakeSettings = intakeSettingsResult.settings;
    const paymentRequired = intakeSettings?.paymentLinkEnabled === true;
    if (!paymentRequired) {
      test.skip(true, 'Skipping paid intake test: practice does not require payment.');
    }
    if (!intakeSettings?.connectedAccount?.id) {
      test.skip(true, 'Skipping paid intake test: practice has no connected Stripe account.');
    }
    if (!shouldRunPaymentMode(true)) {
      test.skip(true, `Skipping paid intake test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    await clientPage.goto('/');
    await waitForSession(clientPage, { timeoutMs: 30000 });

    const practiceId = await resolvePracticeId(ownerContext.request, e2eConfig.practice.slug, e2eConfig.practice.id);
    const conversationId = await getOrCreateConversation(clientContext.request, practiceId);
    const intake = await createIntake({
      slug: e2eConfig.practice.slug,
      name: 'E2E Paid Intake',
      email: e2eConfig.client.email,
      description: 'E2E payment gated',
      amount: intakeSettings?.prefillAmount,
      request: clientContext.request,
      origin: baseURL
    });

    if (!intake.uuid) {
      throw new Error('Intake create did not return uuid');
    }

    const confirmResult = await confirmIntakeLead({
      request: clientContext.request,
      context: clientContext,
      baseURL,
      practiceId,
      practiceSlug: e2eConfig.practice.slug,
      intakeUuid: intake.uuid,
      conversationId
    });

    expect(confirmResult.status).toBe(402);
  });
});
