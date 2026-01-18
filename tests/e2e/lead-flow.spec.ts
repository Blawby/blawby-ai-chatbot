import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForToken } from './helpers/auth';

const e2eConfig = loadE2EConfig();
const WORKER_BASE_URL = process.env.E2E_WORKER_URL || 'http://localhost:8787';
const REMOTE_API_URL = process.env.E2E_REMOTE_API_URL || 'https://staging-api.blawby.com';
const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || 'https://local.blawby.com';
const PAYMENT_MODE = (process.env.E2E_PAYMENT_MODE || 'auto').toLowerCase();
const AUTH_STATE_OWNER = 'playwright/.auth/owner.json';
const AUTH_STATE_CLIENT = 'playwright/.auth/client.json';
const AUTH_STATE_ANON = 'playwright/.auth/anonymous.json';

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
}

interface IntakeSettings {
  paymentLinkEnabled?: boolean;
  prefillAmount?: number;
}

interface IntakeCreateResult {
  uuid?: string;
  clientSecret?: string;
  paymentLinkUrl?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

const getIntakeSettings = async (slug: string): Promise<IntakeSettings | null> => {
  const normalizedSlug = normalizePracticeSlug(slug);
  const response = await fetch(`${REMOTE_API_URL}/api/practice/client-intakes/${encodeURIComponent(normalizedSlug)}/intake`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as { data?: { settings?: IntakeSettings } };
  return payload?.data?.settings ?? null;
};

const createIntake = async (options: {
  slug: string;
  name: string;
  email: string;
  description?: string;
  amount?: number;
  token?: string;
}): Promise<IntakeCreateResult> => {
  const normalizedSlug = normalizePracticeSlug(options.slug);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetch(`${REMOTE_API_URL}/api/practice/client-intakes/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      slug: normalizedSlug,
      amount: options.amount ?? 50,
      name: options.name,
      email: options.email,
      description: options.description,
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Intake create failed (${response.status}): ${text}`);
  }

  const payload = await response.json() as { data?: Record<string, unknown> };
  const data = payload?.data ?? {};
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

const confirmIntakeLead = async (options: {
  token: string;
  practiceId: string;
  intakeUuid: string;
  conversationId: string;
}): Promise<{ status: number; data?: { matterId?: string } } > => {
  const response = await fetch(`${WORKER_BASE_URL}/api/intakes/confirm?practiceId=${encodeURIComponent(options.practiceId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`
    },
    body: JSON.stringify({
      intakeUuid: options.intakeUuid,
      conversationId: options.conversationId
    })
  });

  const payload = await response.json().catch(() => null) as { data?: { matterId?: string } } | null;
  return { status: response.status, data: payload?.data };
};

const getOrCreateConversation = async (token: string, practiceId: string) => {
  const response = await fetch(
    `${WORKER_BASE_URL}/api/conversations/active?practiceId=${encodeURIComponent(practiceId)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
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
  if (!response.ok || !data?.data?.conversation?.id) {
    const fallbackText = data ? JSON.stringify(data) : rawText;
    throw new Error(
      `Failed to create conversation: ${response.status} (${WORKER_BASE_URL}) ${fallbackText.slice(0, 300)}`
    );
  }

  return data.data.conversation.id as string;
};

const getConversationMessages = async (token: string, practiceId: string, conversationId: string) => {
  const url = new URL(`${WORKER_BASE_URL}/api/chat/messages`);
  url.searchParams.set('practiceId', practiceId);
  url.searchParams.set('conversationId', conversationId);
  url.searchParams.set('limit', '50');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => null) as { data?: { messages?: ConversationMessage[] } } | null;
  if (!response.ok || !data?.data?.messages) {
    throw new Error(`Failed to fetch messages: ${response.status}`);
  }

  return data.data.messages as ConversationMessage[];
};

const waitForDecisionMessage = async (options: {
  token: string;
  practiceId: string;
  conversationId: string;
  decision: 'accepted' | 'rejected';
  timeoutMs?: number;
}) => {
  const { token, practiceId, conversationId, decision, timeoutMs = 15000 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const messages = await getConversationMessages(token, practiceId, conversationId);
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

const resolveBaseUrl = (baseURL?: string): string => {
  if (typeof baseURL === 'string' && baseURL.length > 0) return baseURL;
  return DEFAULT_BASE_URL;
};

test.describe('Lead intake workflow', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!e2eConfig, 'E2E credentials are not configured.');

  test('owner accepts lead for signed-in client (no payment required)', async ({ browser }) => {
    if (!e2eConfig) return;

    const intakeSettings = await getIntakeSettings(e2eConfig.practice.slug);
    const paymentRequired = intakeSettings?.paymentLinkEnabled === true;
    if (paymentRequired || !shouldRunPaymentMode(true)) {
      test.skip(true, `Skipping free intake test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
    const ownerContext = await browser.newContext({ storageState: AUTH_STATE_OWNER, baseURL });
    const clientContext = await browser.newContext({ storageState: AUTH_STATE_CLIENT, baseURL });
    const ownerPage = await ownerContext.newPage();
    const clientPage = await clientContext.newPage();

    try {
      await clientPage.goto('/');
      const clientToken = await waitForToken(clientPage, { timeoutMs: 20000 });

      const conversationId = await getOrCreateConversation(clientToken, e2eConfig.practice.id);
      const clientName = `E2E Client ${randomUUID().slice(0, 6)}`;

      const intake = await createIntake({
        slug: e2eConfig.practice.slug,
        name: clientName,
        email: e2eConfig.client.email,
        description: 'E2E accept flow',
        amount: intakeSettings?.prefillAmount,
        token: clientToken
      });

      if (!intake.uuid) {
        throw new Error('Intake create did not return uuid');
      }

      const confirmResult = await confirmIntakeLead({
        token: clientToken,
        practiceId: e2eConfig.practice.id,
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

      await ownerPage.getByTestId(`lead-accept-${matterId}`).click();
      await ownerPage.getByRole('button', { name: 'Accept Lead' }).click();

      await expect(leadCard).toHaveCount(0, { timeout: 20000 });

      const decisionMessage = await waitForDecisionMessage({
        token: clientToken,
        practiceId: e2eConfig.practice.id,
        conversationId,
        decision: 'accepted'
      });

      expect(decisionMessage.content.toLowerCase()).toContain('accepted');
    } finally {
      await clientContext.close();
      await ownerContext.close();
    }
  });

  test('owner rejects lead for anonymous guest (no payment required)', async ({ browser }) => {
    if (!e2eConfig) return;

    const intakeSettings = await getIntakeSettings(e2eConfig.practice.slug);
    const paymentRequired = intakeSettings?.paymentLinkEnabled === true;
    if (!paymentRequired) {
      test.skip(true, 'Skipping payment-gated test: practice does not require payment.');
    }
    if (!shouldRunPaymentMode(true)) {
      test.skip(true, `Skipping payment-gated test for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
    const ownerContext = await browser.newContext({ storageState: AUTH_STATE_OWNER, baseURL });
    const anonymousContext = await browser.newContext({ storageState: AUTH_STATE_ANON, baseURL });
    const ownerPage = await ownerContext.newPage();
    const anonymousPage = await anonymousContext.newPage();

    try {
      await anonymousPage.goto(`/p/${encodeURIComponent(e2eConfig.practice.slug)}`);
      const anonymousToken = await waitForToken(anonymousPage, { timeoutMs: 20000 });

      const conversationId = await getOrCreateConversation(anonymousToken, e2eConfig.practice.id);
      const intakeUuid = randomUUID();
      const clientName = `E2E Guest ${intakeUuid.slice(0, 8)}`;
      const rejectReason = `Conflict check ${intakeUuid.slice(0, 4)}`;

      const intake = await createIntake({
        slug: e2eConfig.practice.slug,
        name: clientName,
        email: `guest+${intakeUuid.slice(0, 6)}@example.com`,
        description: 'E2E reject flow',
        amount: intakeSettings?.prefillAmount,
        token: anonymousToken
      });

      if (!intake.uuid) {
        throw new Error('Intake create did not return uuid');
      }

      const confirmResult = await confirmIntakeLead({
        token: anonymousToken,
        practiceId: e2eConfig.practice.id,
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

      await ownerPage.getByTestId(`lead-reject-${matterId}`).click();
      await ownerPage.fill('#lead-reject-reason', rejectReason);
      await ownerPage.getByRole('button', { name: 'Reject Lead' }).click();

      await expect(leadCard).toHaveCount(0, { timeout: 20000 });

      const decisionMessage = await waitForDecisionMessage({
        token: anonymousToken,
        practiceId: e2eConfig.practice.id,
        conversationId,
        decision: 'rejected'
      });

      expect(decisionMessage.content.toLowerCase()).toContain('declined');
      expect(decisionMessage.content).toContain(rejectReason);
    } finally {
      await anonymousContext.close();
      await ownerContext.close();
    }
  });

  test('payment-required intake is gated until completion', async ({ browser }) => {
    if (!e2eConfig) return;

    const intakeSettings = await getIntakeSettings(e2eConfig.practice.slug);
    const paymentRequired = intakeSettings?.paymentLinkEnabled === true;
    if (!shouldRunPaymentMode(paymentRequired)) {
      const label = paymentRequired ? 'paid' : 'free';
      test.skip(true, `Skipping ${label} flow for E2E_PAYMENT_MODE=${PAYMENT_MODE}.`);
    }

    const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
    const clientContext = await browser.newContext({ storageState: AUTH_STATE_CLIENT, baseURL });
    const clientPage = await clientContext.newPage();

    try {
      await clientPage.goto('/');
      const clientToken = await waitForToken(clientPage, { timeoutMs: 20000 });

      const conversationId = await getOrCreateConversation(clientToken, e2eConfig.practice.id);
      const intake = await createIntake({
        slug: e2eConfig.practice.slug,
        name: 'E2E Paid Intake',
        email: e2eConfig.client.email,
        description: 'E2E payment gated',
        amount: intakeSettings?.prefillAmount,
        token: clientToken
      });

      if (!intake.uuid) {
        throw new Error('Intake create did not return uuid');
      }

      const confirmResult = await confirmIntakeLead({
        token: clientToken,
        practiceId: e2eConfig.practice.id,
        intakeUuid: intake.uuid,
        conversationId
      });

      expect(confirmResult.status).toBe(402);
    } finally {
      await clientContext.close();
    }
  });
});
