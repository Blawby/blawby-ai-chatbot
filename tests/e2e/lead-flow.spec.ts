import { expect, test } from './fixtures';
import type { APIRequestContext, APIResponse, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';
import { AUTH_STATE_PATHS } from './helpers/authState';

const e2eConfig = loadE2EConfig();
const BACKEND_API_URL = process.env.E2E_BACKEND_API_URL || 'https://staging-api.blawby.com';
if (!process.env.E2E_BACKEND_API_URL) {
  console.warn('E2E_BACKEND_API_URL is not set; defaulting to https://staging-api.blawby.com.');
}
const PAYMENT_MODE = (process.env.E2E_PAYMENT_MODE || 'paid').toLowerCase();
const PAYMENT_MODE_EXPLICIT = Boolean(process.env.E2E_PAYMENT_MODE && process.env.E2E_PAYMENT_MODE.trim());
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

const buildCookieHeader = async (
  context: BrowserContext,
  baseURL: string,
  storagePath?: string
): Promise<string> => {
  type CookiePair = { name: string; value: string };

  let cookies = await context.cookies(baseURL);
  if (!cookies.length) {
    cookies = await context.cookies();
  }
  let cookiePairs: CookiePair[] = cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value
  }));

  const hasSessionCookie = cookiePairs.some((cookie) => /better-auth\.session_token/i.test(cookie.name));
  if ((!cookiePairs.length || !hasSessionCookie) && storagePath) {
    try {
      const raw = readFileSync(storagePath, 'utf-8');
      const stored = JSON.parse(raw) as { cookies?: CookiePair[] };
      if (Array.isArray(stored.cookies) && stored.cookies.length > 0) {
        cookiePairs = stored.cookies;
      }
    } catch {
      // ignore storage read failures
    }
  }
  if (!cookiePairs.length) return '';
  return cookiePairs.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

const summarizeCookieHeader = (cookieHeader: string): string[] => (
  cookieHeader
    .split(';')
    .map((segment) => segment.split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name))
);

const fetchDebugResponse = async (
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>
): Promise<{ url: string; status: number; body: string }> => {
  try {
    const response = await request.get(url, { headers });
    const body = await response.text().catch(() => '');
    return {
      url: response.url(),
      status: response.status(),
      body: body.slice(0, 500)
    };
  } catch (error) {
    return {
      url,
      status: -1,
      body: `request_error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

const logMessageFetchDiagnostics = async (options: {
  request: APIRequestContext;
  baseURL: string;
  practiceId: string;
  practiceSlug?: string;
  conversationId: string;
  cookieHeader: string;
  status: number;
  url: string;
  body: string;
}): Promise<void> => {
  const cookieNames = summarizeCookieHeader(options.cookieHeader);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookieHeader) {
    headers.Cookie = options.cookieHeader;
  }

  const conversationPath = `${WORKER_API_URL}/api/conversations/${encodeURIComponent(options.conversationId)}?practiceId=${encodeURIComponent(options.practiceId)}`;
  const conversationCheck = await fetchDebugResponse(options.request, conversationPath, headers);

  let conversationSlugCheck: { url: string; status: number; body: string } | undefined;
  let messagesSlugCheck: { url: string; status: number; body: string } | undefined;
  if (options.practiceSlug && options.practiceSlug !== options.practiceId) {
    const slugConversationPath = `${WORKER_API_URL}/api/conversations/${encodeURIComponent(options.conversationId)}?practiceId=${encodeURIComponent(options.practiceSlug)}`;
    conversationSlugCheck = await fetchDebugResponse(options.request, slugConversationPath, headers);

    const slugMessagesPath = `${WORKER_API_URL}/api/conversations/${encodeURIComponent(options.conversationId)}/messages?practiceId=${encodeURIComponent(options.practiceSlug)}&limit=50`;
    messagesSlugCheck = await fetchDebugResponse(options.request, slugMessagesPath, headers);
  }

  console.warn('[E2E][lead-flow] Message fetch failed', {
    baseURL: options.baseURL,
    practiceId: options.practiceId,
    practiceSlug: options.practiceSlug,
    conversationId: options.conversationId,
    status: options.status,
    url: options.url,
    cookieNames,
    body: options.body.slice(0, 500),
    conversationCheck,
    conversationSlugCheck,
    messagesSlugCheck
  });
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

const intakeSettingsCache = new Map<string, IntakeSettingsResult>();

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
  let response: APIResponse | null = null;
  try {
    response = await request.get('/api/practice/list', {
      headers: { Accept: 'application/json' },
      timeout: 10000
    });
  } catch (error) {
    console.warn('[E2E] Practice list request failed; using fallback practice id.', error);
    return fallbackId;
  }
  if (!response.ok()) {
    console.warn(
      `[E2E] Practice list returned ${response.status()}; using fallback practice id.`
    );
    return fallbackId;
  }
  const payload = await response.json().catch(() => null);
  const practices = extractPracticeList(payload);
  const match = practices.find((practice) => practice?.slug === practiceSlug || practice?.id === fallbackId);
  if (!match?.id) {
    console.warn('[E2E] Practice slug not found in list; using fallback practice id.');
    return fallbackId;
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
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await options.request.get(url, {
      headers: {
        Accept: 'application/json',
        Cookie: cookieHeader
      }
    });
    if (response.ok()) {
      const payload = await response.json().catch(() => null) as {
        data?: { items?: LeadQueueItem[]; matters?: LeadQueueItem[] };
      } | null;
      const items = payload?.data?.items ?? payload?.data?.matters ?? [];
      return items;
    }

    const bodyText = await response.text().catch(() => '');
    const status = response.status();
    const isRateLimited = status === 429 || bodyText.includes('Failed to verify membership (status 429)');
    if (isRateLimited && attempt < maxAttempts - 1) {
      await sleep(1000 * (attempt + 1));
      continue;
    }

    throw new Error(`Failed to fetch lead queue: ${status} ${bodyText}`);
  }

  throw new Error('Failed to fetch lead queue after retries');
};

const waitForLeadInQueue = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
  matterId: string;
  timeoutMs?: number;
}): Promise<void> => {
  const { request, context, baseURL, practiceId, matterId, timeoutMs = 15000 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const items = await getLeadQueue({ request, context, baseURL, practiceId });
    if (items.some((lead) => lead.id === matterId)) {
      return;
    }
    await sleep(1000);
  }

  throw new Error(`Lead ${matterId} not found in queue after ${timeoutMs}ms`);
};

const waitForLeadCard = async (options: {
  page: Page;
  testId: string;
  timeoutMs?: number;
}): Promise<void> => {
  const { page, testId, timeoutMs = 10000 } = options;
  const locator = page.getByTestId(testId);
  const firstPassMs = Math.floor(timeoutMs / 2);

  try {
    await expect(locator).toBeVisible({ timeout: firstPassMs });
    return;
  } catch {
    // Reload once if the list was stale when we navigated.
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {
      // Fallback to basic reload if networkidle times out
      return page.reload().catch(() => undefined);
    });
    const remainingMs = timeoutMs - firstPassMs;
    await expect(locator).toBeVisible({ timeout: remainingMs });
  }
};

const getIntakeSettings = async (options: {
  slug: string;
  request?: APIRequestContext;
  context?: BrowserContext;
  baseURL?: string;
  storagePath?: string;
}): Promise<IntakeSettingsResult> => {
  const normalizedSlug = normalizePracticeSlug(options.slug);
  const cached = intakeSettingsCache.get(normalizedSlug);
  if (cached) return cached;

  const url = `${BACKEND_API_URL}/api/practice/client-intakes/${encodeURIComponent(normalizedSlug)}/intake`;
  const maxAttempts = 3;
  let lastStatus = 0;
  let lastErrorText = '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.context && options.baseURL) {
    const cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = options.request
      ? await options.request.get(url, { headers })
      : await fetch(url, {
        method: 'GET',
        headers
      });

    const ok = typeof response.ok === 'function' ? response.ok() : response.ok;
    const status = typeof response.status === 'function' ? response.status() : response.status;
    lastStatus = status;
    if (!ok) {
      const errorText = await response.text().catch(() => '');
      lastErrorText = errorText;
      if (status === 429 && attempt < maxAttempts - 1) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
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
    const settingsRecord = data.settings as Record<string, unknown>;
    const paymentLinkEnabled = settingsRecord.paymentLinkEnabled ?? settingsRecord.payment_link_enabled;
    const prefillAmount = settingsRecord.prefillAmount ?? settingsRecord.prefill_amount;
    const result = {
      status,
      settings: {
        paymentLinkEnabled: typeof paymentLinkEnabled === 'boolean' ? paymentLinkEnabled : undefined,
        prefillAmount: typeof prefillAmount === 'number' ? prefillAmount : undefined,
        connectedAccount: connectedAccount
          ? {
              id: connectedAccount.id,
              chargesEnabled: connectedAccount.chargesEnabled ?? connectedAccount.charges_enabled
            }
          : undefined
      }
    };
    intakeSettingsCache.set(normalizedSlug, result);
    return result;
  }

  return { settings: null, status: lastStatus || 429, errorText: lastErrorText };
};

const createIntake = async (options: {
  slug: string;
  name: string;
  email: string;
  description?: string;
  amount?: number;
  request?: APIRequestContext;
  context?: BrowserContext;
  baseURL?: string;
  storagePath?: string;
  origin?: string;
}): Promise<IntakeCreateResult> => {
  const normalizedSlug = normalizePracticeSlug(options.slug);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.origin) {
    headers.Origin = options.origin;
    headers.Referer = `${options.origin}/`;
  }
  if (options.request && options.context && options.baseURL) {
    const cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
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
  storagePath?: string;
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

  const cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
  const initial = await parseConfirmResponse(await options.request.post(path, {
    data: payload,
    headers: cookieHeader
      ? {
          'Content-Type': 'application/json',
          Cookie: cookieHeader
        }
      : undefined
  }));
  if (initial.status !== 404) {
    if (initial.status !== 200) {
      console.warn('[E2E] Intake confirm returned non-200', {
        status: initial.status,
        url: initial.url,
        error: initial.error,
        body: initial.rawText?.slice(0, 500) ?? '',
        practiceId: options.practiceId,
        practiceSlug: options.practiceSlug,
        conversationId: options.conversationId,
        intakeUuid: options.intakeUuid
      });
    }
    return { status: initial.status, data: initial.data };
  }

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

  if (retry.status !== 200) {
    console.warn('[E2E] Intake confirm returned non-200', {
      status: retry.status,
      url: retry.url,
      error: retry.error,
      body: retry.rawText?.slice(0, 500) ?? '',
      practiceId: options.practiceId,
      practiceSlug: options.practiceSlug,
      conversationId: options.conversationId,
      intakeUuid: options.intakeUuid
    });
  }

  return { status: retry.status, data: retry.data };
};

const getOrCreateConversation = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
  practiceSlug?: string;
  storagePath?: string;
}) => {
  const ensureCookieHeader = async (): Promise<string> => {
    let cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
    if (!cookieHeader) {
      const page = await options.context.newPage();
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await waitForSession(page, { timeoutMs: 30000, cookieUrl: options.baseURL });
      } finally {
        await page.close();
      }
      cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
    }
    return cookieHeader;
  };

  const maxAttempts = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const cookieHeader = await ensureCookieHeader();
    const params = new URLSearchParams({ practiceId: options.practiceId });
    if (options.practiceSlug) {
      params.set('practiceSlug', options.practiceSlug);
    }
    const response = await options.request.get(
      `/api/conversations/active?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader
        }
      }
    );

    if ((response.status() === 401 || response.status() === 429) && attempt < maxAttempts - 1) {
      await sleep(500 * (attempt + 1));
      continue;
    }

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
      lastError = new Error(
        `Failed to create conversation: ${response.status()} (${response.url()}) ${fallbackText.slice(0, 300)}`
      );
      break;
    }

    return data.data.conversation.id as string;
  }

  throw lastError ?? new Error('Failed to create conversation: unknown error');
};

const getConversationMessages = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
  practiceSlug?: string;
  conversationId: string;
  storagePath?: string;
}) => {
  const url = `${WORKER_API_URL}/api/conversations/${encodeURIComponent(options.conversationId)}/messages?practiceId=${encodeURIComponent(options.practiceId)}&limit=50`;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
    const response = await options.request.get(url, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader
      }
    });

    if ((response.status() === 401 || response.status() === 429) && attempt < maxAttempts - 1) {
      await sleep(500 * (attempt + 1));
      continue;
    }

    const rawText = await response.text().catch(() => '');
    let data: { data?: { messages?: ConversationMessage[] } } | null = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText) as { data?: { messages?: ConversationMessage[] } };
      } catch {
        data = null;
      }
    }
    if (!response.ok() || !data?.data?.messages) {
      await logMessageFetchDiagnostics({
        request: options.request,
        baseURL: options.baseURL,
        practiceId: options.practiceId,
        practiceSlug: options.practiceSlug,
        conversationId: options.conversationId,
        cookieHeader,
        status: response.status(),
        url: response.url(),
        body: rawText || JSON.stringify(data)
      });
      throw new Error(`Failed to fetch messages: ${response.status()}`);
    }

    return data.data.messages as ConversationMessage[];
  }

  throw new Error('Failed to fetch messages after retries');
};

const waitForDecisionMessage = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  practiceId: string;
  practiceSlug?: string;
  conversationId: string;
  decision: 'accepted' | 'rejected';
  intakeUuid?: string;
  reason?: string;
  storagePath?: string;
  timeoutMs?: number;
}) => {
  const {
    request,
    context,
    baseURL,
    practiceId,
    practiceSlug,
    conversationId,
    decision,
    intakeUuid,
    reason,
    storagePath,
    timeoutMs = 15000
  } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const messages = await getConversationMessages({
      request,
      context,
      baseURL,
      practiceId,
      practiceSlug,
      conversationId,
      storagePath
    });
    const match = messages.find(message => {
      if (message.metadata?.intakeDecision !== decision) return false;
      if (intakeUuid && message.metadata?.intakeUuid !== intakeUuid) return false;
      if (reason && message.metadata?.reason !== reason) return false;
      return true;
    });
    if (match) return match;
    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${decision} intake decision message`);
};

const shouldRunPaymentMode = (required: boolean): boolean => {
  if (!PAYMENT_MODE_EXPLICIT) return true;
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
  test.describe.configure({ mode: 'serial', timeout: 90000 });
  test.skip(!e2eConfig, 'E2E credentials are not configured.');

  test('owner accepts lead for signed-in client (no payment required)', async ({
    baseURL,
    ownerContext,
    clientContext,
    ownerPage,
    clientPage
  }) => {
    if (!e2eConfig) return;

    if (!shouldRunPaymentMode(false)) {
      test.skip(true, `Skipping free intake test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    const intakeSettingsResult = await getIntakeSettings({
      slug: e2eConfig.practice.slug,
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      storagePath: AUTH_STATE_PATHS.owner
    });
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

    await clientPage.goto('/');

    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    const practiceId = await resolvePracticeId(ownerContext.request, e2eConfig.practice.slug, e2eConfig.practice.id);
    const conversationId = await getOrCreateConversation({
      request: clientContext.request,
      context: clientContext,
      baseURL,
      practiceId,
      practiceSlug,
      storagePath: AUTH_STATE_PATHS.client
    });
    const clientName = `E2E Client ${randomUUID().slice(0, 6)}`;

    const intake = await createIntake({
      slug: e2eConfig.practice.slug,
      name: clientName,
      email: e2eConfig.client.email,
      description: 'E2E accept flow',
      amount: intakeSettings?.prefillAmount,
      request: clientContext.request,
      context: clientContext,
      baseURL,
      storagePath: AUTH_STATE_PATHS.client,
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
      conversationId,
      storagePath: AUTH_STATE_PATHS.client
    });

    expect(confirmResult.status).toBe(200);
    const matterId = confirmResult.data?.matterId;
    if (!matterId) {
      throw new Error('Intake confirm did not return matterId');
    }

    await waitForLeadInQueue({
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      practiceId,
      matterId
    });

    await ownerPage.goto('/practice/leads');
    await waitForLeadCard({ page: ownerPage, testId: `lead-card-${matterId}` });

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
      practiceSlug: e2eConfig.practice.slug,
      conversationId,
      decision: 'accepted',
      intakeUuid: intake.uuid,
      storagePath: AUTH_STATE_PATHS.client
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

    if (!shouldRunPaymentMode(false)) {
      test.skip(true, `Skipping free intake test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    const intakeSettingsResult = await getIntakeSettings({
      slug: e2eConfig.practice.slug,
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      storagePath: AUTH_STATE_PATHS.owner
    });
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

    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await anonPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`);
    await waitForSession(anonPage, { timeoutMs: 30000, skipIfCookiePresent: false, cookieUrl: baseURL });

    const practiceId = await resolvePracticeId(ownerContext.request, e2eConfig.practice.slug, e2eConfig.practice.id);
    const conversationId = await getOrCreateConversation({
      request: anonContext.request,
      context: anonContext,
      baseURL,
      practiceId,
      practiceSlug,
      storagePath: AUTH_STATE_PATHS.anonymous
    });
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
      context: anonContext,
      baseURL,
      storagePath: AUTH_STATE_PATHS.anonymous,
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
      conversationId,
      storagePath: AUTH_STATE_PATHS.anonymous
    });

    expect(confirmResult.status).toBe(200);
    const matterId = confirmResult.data?.matterId;
    if (!matterId) {
      throw new Error('Intake confirm did not return matterId');
    }

    await waitForLeadInQueue({
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      practiceId,
      matterId
    });

    await ownerPage.goto('/practice/leads');
    await waitForLeadCard({ page: ownerPage, testId: `lead-card-${matterId}` });

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
      practiceSlug: e2eConfig.practice.slug,
      conversationId,
      decision: 'rejected',
      intakeUuid: intake.uuid,
      reason: rejectReason,
      storagePath: AUTH_STATE_PATHS.anonymous
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

    if (!shouldRunPaymentMode(true)) {
      test.skip(true, `Skipping paid intake test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    const intakeSettingsResult = await getIntakeSettings({
      slug: e2eConfig.practice.slug,
      request: clientContext.request,
      context: clientContext,
      baseURL,
      storagePath: AUTH_STATE_PATHS.client
    });
    if (!intakeSettingsResult.settings) {
      const message = formatIntakeSettingsSkip(intakeSettingsResult);
      if (PAYMENT_MODE_EXPLICIT && PAYMENT_MODE === 'paid') {
        throw new Error(message);
      }
      console.warn(message);
      test.skip(true, message);
    }
    const intakeSettings = intakeSettingsResult.settings;
    const paymentRequired = intakeSettings?.paymentLinkEnabled === true;
    if (!paymentRequired) {
      if (PAYMENT_MODE_EXPLICIT && PAYMENT_MODE === 'paid') {
        throw new Error('Paid intake test requires a practice with payment enabled.');
      }
      test.skip(true, 'Skipping paid intake test: practice does not require payment.');
    }
    if (!intakeSettings?.connectedAccount?.id) {
      if (PAYMENT_MODE_EXPLICIT && PAYMENT_MODE === 'paid') {
        throw new Error('Paid intake test requires a connected Stripe account on the practice.');
      }
      test.skip(true, 'Skipping paid intake test: practice has no connected Stripe account.');
    }

    await clientPage.goto('/');

    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    const practiceId = await resolvePracticeId(ownerContext.request, e2eConfig.practice.slug, e2eConfig.practice.id);
    const conversationId = await getOrCreateConversation({
      request: clientContext.request,
      context: clientContext,
      baseURL,
      practiceId,
      practiceSlug,
      storagePath: AUTH_STATE_PATHS.client
    });
    const intake = await createIntake({
      slug: e2eConfig.practice.slug,
      name: 'E2E Paid Intake',
      email: e2eConfig.client.email,
      description: 'E2E payment gated',
      amount: intakeSettings?.prefillAmount,
      request: clientContext.request,
      context: clientContext,
      baseURL,
      storagePath: AUTH_STATE_PATHS.client,
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
      conversationId,
      storagePath: AUTH_STATE_PATHS.client
    });

    expect(confirmResult.status).toBe(402);
  });
});
