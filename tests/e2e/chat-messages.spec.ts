import { expect, test } from './fixtures';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const buildCookieHeader = async (context: BrowserContext, baseURL: string): Promise<string> => {
  let cookies = await context.cookies(baseURL);
  if (!cookies.length) {
    cookies = await context.cookies();
  }
  if (!cookies.length) return '';
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

const getOrCreateConversation = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  page?: Page;
  baseURL: string;
  practiceId: string;
}): Promise<string> => {
  const ensureCookieHeader = async (): Promise<string> => {
    let cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    if (!cookieHeader && options.page) {
      await waitForSession(options.page, {
        timeoutMs: 30000,
        skipIfCookiePresent: false,
        cookieUrl: options.baseURL
      });
      cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    }
    return cookieHeader;
  };

  const maxAttempts = 3;
  let retryDelayMs = 500;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const cookieHeader = await ensureCookieHeader();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await options.request.get(
      `/api/conversations/active?practiceId=${encodeURIComponent(options.practiceId)}`,
      { headers }
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

    if (response.ok() && data?.data?.conversation?.id) {
      return data.data.conversation.id as string;
    }

    const fallbackText = data ? JSON.stringify(data) : rawText;
    lastError = new Error(
      `Failed to create conversation: ${response.status()} (${response.url()}) ${fallbackText.slice(0, 300)}`
    );

    const status = response.status();
    const retriable = status === 401 || status === 429 || status >= 500;
    if (!retriable || attempt >= maxAttempts - 1) {
      break;
    }

    const retryAfter = response.headers()['retry-after'];
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
    const waitMs = Number.isFinite(retryAfterMs)
      ? Math.max(retryAfterMs, retryDelayMs)
      : retryDelayMs;
    await sleep(Math.min(Math.max(waitMs, 250), 5000));
    retryDelayMs = Math.min(retryDelayMs * 2, 3000);
  }

  throw lastError ?? new Error('Failed to create conversation: unknown error');
};

const sendChatMessageOverWs = async (options: {
  page: Page;
  baseURL: string;
  conversationId: string;
  content: string;
}): Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }> => {
  const wsUrl = new URL(`/api/conversations/${encodeURIComponent(options.conversationId)}/ws`, options.baseURL);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  return options.page.evaluate(async ({ wsUrl: wsUrlString, conversationId, content }) => {
    const buildClientId = () => {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return (crypto as { randomUUID: () => string }).randomUUID();
      }
      return `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    return await new Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }>((resolve, reject) => {
      const ws = new WebSocket(wsUrlString);
      const clientId = buildClientId();
      let authOk = false;
      let settled = false;
      const timeoutId = setTimeout(() => {
        settled = true;
        ws.close();
        reject(new Error('Timed out waiting for message ack'));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        try {
          ws.close();
        } catch {
          // ignore
        }
      };

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'auth',
          data: {
            protocol_version: 1,
            client_info: { platform: 'e2e' }
          }
        }));
      });

      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          return;
        }
        let frame: { type?: string; data?: Record<string, unknown> };
        try {
          frame = JSON.parse(event.data) as { type?: string; data?: Record<string, unknown> };
        } catch {
          return;
        }

        if (frame.type === 'auth.error' || frame.type === 'error') {
          settled = true;
          cleanup();
          const message = typeof frame.data?.message === 'string' ? frame.data.message : 'WebSocket error';
          reject(new Error(message));
          return;
        }

        if (frame.type === 'auth.ok') {
          authOk = true;
          ws.send(JSON.stringify({
            type: 'message.send',
            data: {
              conversation_id: conversationId,
              client_id: clientId,
              content
            }
          }));
          return;
        }

        if (!authOk) {
          return;
        }

        if (frame.type === 'message.ack' && frame.data) {
          const messageId = typeof frame.data.message_id === 'string' ? frame.data.message_id : '';
          const seq = typeof frame.data.seq === 'number' ? frame.data.seq : Number(frame.data.seq);
          const serverTs = typeof frame.data.server_ts === 'string' ? frame.data.server_ts : '';
          if (!messageId || !serverTs || !Number.isFinite(seq)) {
            settled = true;
            cleanup();
            reject(new Error('Invalid message ack payload'));
            return;
          }
          settled = true;
          cleanup();
          resolve({ messageId, seq, serverTs, clientId });
          return;
        }
      });

      ws.addEventListener('error', () => {
        settled = true;
        cleanup();
        reject(new Error('WebSocket error'));
      });

      ws.addEventListener('close', (event) => {
        if (!settled) {
          cleanup();
          reject(new Error(`WebSocket closed (${event.code}) ${event.reason || 'closed'}`));
        }
      });
    });
  }, { wsUrl: wsUrl.toString(), conversationId: options.conversationId, content: options.content });
};

const sendChatMessageWithRetry = async (options: {
  page: Page;
  baseURL: string;
  conversationId: string;
  content: string;
}, retries = 2): Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await sendChatMessageOverWs(options);
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await options.page.waitForTimeout(1000 * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to send chat message');
};

const getConversationMessages = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  page?: Page;
  baseURL: string;
  practiceId: string;
  conversationId: string;
}): Promise<ConversationMessage[]> => {
  const url = `/api/chat/messages?practiceId=${encodeURIComponent(options.practiceId)}&conversationId=${encodeURIComponent(options.conversationId)}&limit=50`;
  const ensureCookieHeader = async (): Promise<string> => {
    let cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    if (!cookieHeader && options.page) {
      await waitForSession(options.page, {
        timeoutMs: 30000,
        skipIfCookiePresent: false,
        cookieUrl: options.baseURL
      });
      cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    }
    return cookieHeader;
  };

  const maxAttempts = 3;
  let retryDelayMs = 500;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const cookieHeader = await ensureCookieHeader();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await options.request.get(url, { headers });
    const rawText = await response.text().catch(() => '');
    let payload: { data?: { messages?: ConversationMessage[] } } | null = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as { data?: { messages?: ConversationMessage[] } };
      } catch {
        payload = null;
      }
    }

    if (response.ok() && payload?.data?.messages) {
      return payload.data.messages;
    }

    const fallbackText = payload ? JSON.stringify(payload) : rawText;
    lastError = new Error(`Failed to fetch messages: ${response.status()} ${fallbackText.slice(0, 300)}`);

    const status = response.status();
    const retriable = status === 401 || status === 429 || status >= 500;
    if (!retriable || attempt >= maxAttempts - 1) {
      break;
    }

    const retryAfter = response.headers()['retry-after'];
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
    const waitMs = Number.isFinite(retryAfterMs)
      ? Math.max(retryAfterMs, retryDelayMs)
      : retryDelayMs;
    await sleep(Math.min(Math.max(waitMs, 250), 5000));
    retryDelayMs = Math.min(retryDelayMs * 2, 3000);
  }

  throw lastError ?? new Error('Failed to fetch messages after retries');
};

test.describe('Chat messaging', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test('anonymous guest can send a chat message', async ({ anonContext, anonPage, baseURL }) => {
    if (!e2eConfig) return;
    await anonPage.goto(`/p/${encodeURIComponent(e2eConfig.practice.slug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(anonPage, { timeoutMs: 60000 });
    const conversationId = await getOrCreateConversation({
      request: anonContext.request,
      context: anonContext,
      page: anonPage,
      baseURL,
      practiceId: e2eConfig.practice.id
    });
    const content = `E2E anon ${Date.now()}`;
    await sendChatMessageWithRetry({
      page: anonPage,
      baseURL,
      conversationId,
      content
    });

    const messages = await getConversationMessages({
      request: anonContext.request,
      context: anonContext,
      page: anonPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
  });

  test('signed-in client can send a chat message', async ({ clientContext, clientPage, baseURL }) => {
    if (!e2eConfig) return;
    await clientPage.goto(`/p/${encodeURIComponent(e2eConfig.practice.slug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(clientPage, { timeoutMs: 60000 });
    const conversationId = await getOrCreateConversation({
      request: clientContext.request,
      context: clientContext,
      page: clientPage,
      baseURL,
      practiceId: e2eConfig.practice.id
    });
    const content = `E2E client ${Date.now()}`;
    await sendChatMessageWithRetry({
      page: clientPage,
      baseURL,
      conversationId,
      content
    });

    const messages = await getConversationMessages({
      request: clientContext.request,
      context: clientContext,
      page: clientPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
  });

  test('practice owner can send a chat message', async ({ ownerContext, ownerPage, baseURL }) => {
    if (!e2eConfig) return;
    await ownerPage.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(ownerPage, { timeoutMs: 60000 });
    const conversationId = await getOrCreateConversation({
      request: ownerContext.request,
      context: ownerContext,
      page: ownerPage,
      baseURL,
      practiceId: e2eConfig.practice.id
    });
    const content = `E2E owner ${Date.now()}`;
    await sendChatMessageWithRetry({
      page: ownerPage,
      baseURL,
      conversationId,
      content
    });

    const messages = await getConversationMessages({
      request: ownerContext.request,
      context: ownerContext,
      page: ownerPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
  });
});
