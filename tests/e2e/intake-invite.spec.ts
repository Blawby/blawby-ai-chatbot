import { expect, test } from './fixtures';
import type { APIRequestContext, APIResponse, BrowserContext } from '@playwright/test';
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

interface IntakeSettings {
  paymentLinkEnabled?: boolean;
  prefillAmount?: number;
  connectedAccount?: {
    id?: string;
    chargesEnabled?: boolean;
  };
}

type IntakeSettingsResult = {
  settings: IntakeSettings | null;
  status: number;
  errorText?: string;
};

type PracticeSummary = {
  id?: string;
  slug?: string;
};

type IntakeCreateResult = {
  uuid?: string;
  clientSecret?: string;
  paymentLinkUrl?: string;
  amount?: number;
  currency?: string;
  status?: string;
};

type ConfirmResponse = {
  status: number;
  data?: { matterId?: string };
  error?: string;
  url?: string;
  rawText?: string;
};

type InviteResponse = {
  status: number;
  data?: { success?: boolean; message?: string };
  url?: string;
  rawText?: string;
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

const getIntakeSettings = async (options: {
  slug: string;
  request?: APIRequestContext;
  context?: BrowserContext;
  baseURL?: string;
  storagePath?: string;
}): Promise<IntakeSettingsResult> => {
  const normalizedSlug = normalizePracticeSlug(options.slug);
  const url = `${BACKEND_API_URL}/api/practice/client-intakes/${encodeURIComponent(normalizedSlug)}/intake`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.context && options.baseURL) {
    const cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
  }

  const response = options.request
    ? await options.request.get(url, { headers })
    : await fetch(url, {
      method: 'GET',
      headers
    });

  const status = typeof response.status === 'function' ? response.status() : response.status;
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    return { settings: null, status, errorText };
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) {
    return { settings: null, status };
  }
  const data = (payload.data && typeof payload.data === 'object')
    ? payload.data as Record<string, unknown>
    : payload;
  const settings = data.settings && typeof data.settings === 'object'
    ? data.settings as Record<string, unknown>
    : data;
  const connectedAccount = data.connected_account && typeof data.connected_account === 'object'
    ? data.connected_account as Record<string, unknown>
    : undefined;

  return {
    status,
    settings: {
      paymentLinkEnabled: typeof settings.payment_link_enabled === 'boolean'
        ? settings.payment_link_enabled
        : typeof settings.paymentLinkEnabled === 'boolean'
          ? settings.paymentLinkEnabled
          : undefined,
      prefillAmount: typeof settings.prefill_amount === 'number'
        ? settings.prefill_amount
        : typeof settings.prefillAmount === 'number'
          ? settings.prefillAmount
          : undefined,
      connectedAccount: connectedAccount
        ? {
            id: typeof connectedAccount.id === 'string' ? connectedAccount.id : undefined,
            chargesEnabled: typeof connectedAccount.charges_enabled === 'boolean'
              ? connectedAccount.charges_enabled
              : typeof connectedAccount.chargesEnabled === 'boolean'
                ? connectedAccount.chargesEnabled
                : undefined
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
}): Promise<{ status: number; data?: { matterId?: string } }> => {
  const params = new URLSearchParams({ practiceId: options.practiceId });
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
};

const triggerIntakeInvitation = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  intakeUuid: string;
  storagePath?: string;
}): Promise<InviteResponse> => {
  const path = `/api/practice/client-intakes/${encodeURIComponent(options.intakeUuid)}/invite`;
  const cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
  const response = await options.request.post(path, {
    headers: cookieHeader
      ? {
          'Content-Type': 'application/json',
          Cookie: cookieHeader
        }
      : undefined
  });
  const status = response.status();
  const url = response.url();
  const rawText = await response.text().catch(() => '');
  let data: { success?: boolean; message?: string } | undefined;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as { success?: boolean; message?: string };
    } catch {
      data = undefined;
    }
  }
  return { status, data, url, rawText };
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
        await waitForSession(page, { timeoutMs: 30000 });
      } finally {
        await page.close();
      }
      cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
    }
    return cookieHeader;
  };

  const cookieHeader = await ensureCookieHeader();
  const params = new URLSearchParams({ practiceId: options.practiceId });
  const response = await options.request.get(
    `/api/conversations/active?${params.toString()}`,
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader
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

test.describe('Intake invite flow', () => {
  test.describe.configure({ mode: 'serial', timeout: 90000 });
  test.skip(!e2eConfig, 'E2E credentials are not configured.');

  test('anonymous intake confirmation triggers invite endpoint', async ({
    baseURL,
    anonContext,
    anonPage,
    ownerContext
  }) => {
    if (!e2eConfig) return;

    const intakeSettingsResult = await getIntakeSettings({
      slug: e2eConfig.practice.slug,
      request: anonContext.request,
      context: anonContext,
      baseURL,
      storagePath: AUTH_STATE_PATHS.anonymous
    });
    if (!intakeSettingsResult.settings) {
      const detail = intakeSettingsResult.errorText
        ? ` ${intakeSettingsResult.errorText.slice(0, 200)}`
        : '';
      test.skip(true, `Skipping intake invite test: unable to load intake settings (${intakeSettingsResult.status}).${detail}`);
    }
    const intakeSettings = intakeSettingsResult.settings;
    if (intakeSettings?.paymentLinkEnabled === true) {
      test.skip(true, 'Skipping intake invite test: practice requires payment.');
    }

    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await anonPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`);
    await waitForSession(anonPage, { timeoutMs: 30000 });

    const practiceId = await resolvePracticeId(
      ownerContext.request,
      e2eConfig.practice.slug,
      e2eConfig.practice.id
    );
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

    const intake = await createIntake({
      slug: e2eConfig.practice.slug,
      name: clientName,
      email: `guest+${intakeUuid.slice(0, 6)}@example.com`,
      description: 'E2E invite flow',
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

    const inviteResponse = await triggerIntakeInvitation({
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      intakeUuid: intake.uuid,
      storagePath: AUTH_STATE_PATHS.owner
    });

    if (inviteResponse.status !== 200) {
      throw new Error(
        `Invite trigger failed: ${inviteResponse.status} ${inviteResponse.url ?? ''} ${inviteResponse.rawText?.slice(0, 300) ?? ''}`
      );
    }
  });
});
