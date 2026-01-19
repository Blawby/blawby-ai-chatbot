import { test, expect, type APIRequestContext } from '@playwright/test';
import { loadE2EConfig } from './helpers/e2eConfig';
import { waitForSession } from './helpers/auth';

const e2eConfig = loadE2EConfig();
const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || 'https://local.blawby.com';
const AUTH_STATE_OWNER = 'playwright/.auth/owner.json';
const AUTH_STATE_CLIENT = 'playwright/.auth/client.json';
const AUTH_STATE_ANON = 'playwright/.auth/anonymous.json';

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
}

const resolveBaseUrl = (baseURL?: string): string => {
  if (typeof baseURL === 'string' && baseURL.length > 0) return baseURL;
  return DEFAULT_BASE_URL;
};

const getOrCreateConversation = async (request: APIRequestContext, practiceId: string): Promise<string> => {
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

const sendChatMessage = async (options: {
  request: APIRequestContext;
  practiceId: string;
  conversationId: string;
  content: string;
}): Promise<{ status: number; data?: ConversationMessage }> => {
  const response = await options.request.post(
    `/api/chat/messages?practiceId=${encodeURIComponent(options.practiceId)}`,
    {
      data: {
        conversationId: options.conversationId,
        content: options.content
      }
    }
  );

  const payload = await response.json().catch(() => null) as { data?: ConversationMessage } | null;
  return { status: response.status(), data: payload?.data };
};

const getConversationMessages = async (options: {
  request: APIRequestContext;
  practiceId: string;
  conversationId: string;
}): Promise<ConversationMessage[]> => {
  const url = `/api/chat/messages?practiceId=${encodeURIComponent(options.practiceId)}&conversationId=${encodeURIComponent(options.conversationId)}&limit=50`;
  const response = await options.request.get(url, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const payload = await response.json().catch(() => null) as { data?: { messages?: ConversationMessage[] } } | null;
  if (!response.ok() || !payload?.data?.messages) {
    throw new Error(`Failed to fetch messages: ${response.status()}`);
  }

  return payload.data.messages;
};

test.describe('Chat messaging', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial' });

  test('anonymous guest can send a chat message', async ({ browser }) => {
    if (!e2eConfig) return;
    const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
    const context = await browser.newContext({ storageState: AUTH_STATE_ANON, baseURL });
    const page = await context.newPage();
    await page.goto(`/p/${encodeURIComponent(e2eConfig.practice.slug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 20000 });
    const conversationId = await getOrCreateConversation(context.request, e2eConfig.practice.id);
    const content = `E2E anon ${Date.now()}`;

    const sendResult = await sendChatMessage({
      request: context.request,
      practiceId: e2eConfig.practice.id,
      conversationId,
      content
    });

    expect(sendResult.status).toBe(200);
    expect(sendResult.data?.content).toBe(content);

    const messages = await getConversationMessages({
      request: context.request,
      practiceId: e2eConfig.practice.id,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
    await context.close();
  });

  test('signed-in client can send a chat message', async ({ browser }) => {
    if (!e2eConfig) return;
    const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
    const context = await browser.newContext({ storageState: AUTH_STATE_CLIENT, baseURL });
    const page = await context.newPage();
    await page.goto(`/p/${encodeURIComponent(e2eConfig.practice.slug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 20000 });
    const conversationId = await getOrCreateConversation(context.request, e2eConfig.practice.id);
    const content = `E2E client ${Date.now()}`;

    const sendResult = await sendChatMessage({
      request: context.request,
      practiceId: e2eConfig.practice.id,
      conversationId,
      content
    });

    expect(sendResult.status).toBe(200);
    expect(sendResult.data?.content).toBe(content);

    const messages = await getConversationMessages({
      request: context.request,
      practiceId: e2eConfig.practice.id,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
    await context.close();
  });

  test('practice owner can send a chat message', async ({ browser }) => {
    if (!e2eConfig) return;
    const baseURL = resolveBaseUrl(test.info().project.use.baseURL as string | undefined);
    const context = await browser.newContext({ storageState: AUTH_STATE_OWNER, baseURL });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(page, { timeoutMs: 20000 });
    const conversationId = await getOrCreateConversation(context.request, e2eConfig.practice.id);
    const content = `E2E owner ${Date.now()}`;

    const sendResult = await sendChatMessage({
      request: context.request,
      practiceId: e2eConfig.practice.id,
      conversationId,
      content
    });

    expect(sendResult.status).toBe(200);
    expect(sendResult.data?.content).toBe(content);

    const messages = await getConversationMessages({
      request: context.request,
      practiceId: e2eConfig.practice.id,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
    await context.close();
  });
});
