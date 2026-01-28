import { expect, test } from './fixtures';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';

const e2eConfig = loadE2EConfig();

const buildCookieHeader = async (context: BrowserContext, baseURL: string): Promise<string> => {
  let cookies = await context.cookies(baseURL);
  if (!cookies.length) {
    cookies = await context.cookies();
  }
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

const getOrCreateConversation = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  page?: Page;
  baseURL: string;
  practiceId: string;
  practiceSlug?: string;
}): Promise<string> => {
  const ensureCookieHeader = async (): Promise<string> => {
    let cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    if (!cookieHeader && options.page) {
      await waitForSession(options.page, { timeoutMs: 30000 });
      cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    }
    return cookieHeader;
  };

  const cookieHeader = await ensureCookieHeader();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const params = new URLSearchParams({ practiceId: options.practiceId });
  const response = await options.request.get(
    `/api/conversations/active?${params.toString()}`,
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
  throw new Error(
    `Failed to create conversation: ${response.status()} (${response.url()}) ${fallbackText.slice(0, 300)}`
  );
};

const waitForMessageViaWebSocket = async (options: {
  page: Page;
  baseURL: string;
  conversationId: string;
  content: string;
  timeoutMs?: number;
}): Promise<{ ready: Promise<void>; wait: Promise<void> }> => {
  if (!options.baseURL) {
    throw new Error('baseURL is required for WebSocket connection');
  }
  const wsUrl = new URL(`/api/conversations/${encodeURIComponent(options.conversationId)}/ws`, options.baseURL);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  const listenerKey = `e2e-ws-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const ready = options.page.evaluate(async ({ wsUrl: wsUrlString, key }) => {
    return await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrlString);
      const windowWithE2E = window as Window & {
        __e2eWsListeners?: Record<string, { ws: WebSocket; ready: boolean }>;
      };
      if (!windowWithE2E.__e2eWsListeners) {
        windowWithE2E.__e2eWsListeners = {};
      }
      windowWithE2E.__e2eWsListeners[key] = { ws, ready: false };

      const cleanup = () => {
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
          cleanup();
          const message = typeof frame.data?.message === 'string' ? frame.data.message : 'WebSocket error';
          reject(new Error(message));
          return;
        }

        if (frame.type === 'auth.ok') {
          windowWithE2E.__e2eWsListeners[key].ready = true;
          resolve();
        }
      });

      ws.addEventListener('error', () => {
        cleanup();
        reject(new Error('WebSocket error'));
      });

      ws.addEventListener('close', (event) => {
        cleanup();
        reject(new Error(`WebSocket closed (${event.code}) ${event.reason || 'closed'}`));
      });
    });
  }, { wsUrl: wsUrl.toString(), key: listenerKey });

  const wait = options.page.evaluate(async ({ key, content, timeoutMs: timeout }) => {
    return await new Promise<void>((resolve, reject) => {
      const windowWithE2E = window as Window & {
        __e2eWsListeners?: Record<string, { ws: WebSocket; ready: boolean }>;
      };
      const state = windowWithE2E.__e2eWsListeners?.[key];
      if (!state) {
        reject(new Error('WebSocket listener not initialized'));
        return;
      }

      const ws = state.ws;
      let settled = false;
      const timeoutId = setTimeout(() => {
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error(`Timed out waiting for message in WebSocket after ${timeout}ms`));
      }, timeout ?? 5000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        try {
          ws.close();
        } catch {
          // ignore
        }
        if (windowWithE2E.__e2eWsListeners) {
          delete windowWithE2E.__e2eWsListeners[key];
        }
      };

      const handleMessage = (event: MessageEvent) => {
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

        if (frame.type === 'message.new' && frame.data) {
          const messageContent = typeof frame.data.content === 'string' ? frame.data.content : '';
          if (messageContent === content) {
            settled = true;
            cleanup();
            resolve();
            return;
          }
        }
      };

      const handleError = () => {
        settled = true;
        cleanup();
        reject(new Error('WebSocket error'));
      };

      const handleClose = (event: CloseEvent) => {
        if (!settled) {
          cleanup();
          reject(new Error(`WebSocket closed (${event.code}) ${event.reason || 'closed'}`));
        }
      };

      ws.addEventListener('message', handleMessage);
      ws.addEventListener('error', handleError);
      ws.addEventListener('close', handleClose);
    });
  }, { key: listenerKey, content: options.content, timeoutMs: options.timeoutMs ?? 5000 });

  return { ready, wait };
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
      let ackPayload: { messageId: string; seq: number; serverTs: string } | null = null;
      let broadcastMessageId: string | null = null;
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
          ackPayload = { messageId, seq, serverTs };
          if (broadcastMessageId && broadcastMessageId === messageId) {
            settled = true;
            cleanup();
            resolve({ messageId, seq, serverTs, clientId });
          }
          return;
        }

        if (frame.type === 'message.new' && frame.data) {
          const broadcastClientId = typeof frame.data.client_id === 'string' ? frame.data.client_id : '';
          const broadcastMessage = typeof frame.data.message_id === 'string' ? frame.data.message_id : '';
          if (!broadcastMessage || broadcastClientId !== clientId) {
            return;
          }
          broadcastMessageId = broadcastMessage;
          if (ackPayload && ackPayload.messageId === broadcastMessageId) {
            settled = true;
            cleanup();
            resolve({ messageId: ackPayload.messageId, seq: ackPayload.seq, serverTs: ackPayload.serverTs, clientId });
          }
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

const sendChatMessage = async (options: {
  page: Page;
  baseURL: string;
  conversationId: string;
  content: string;
}): Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }> => {
  return await sendChatMessageOverWs(options);
};

const createConversationForPage = async (options: {
  page: Page;
  practiceId: string;
  practiceSlug?: string;
}): Promise<string> => {
  const userId = await waitForSession(options.page, { timeoutMs: 30000 });
  if (!userId) {
    throw new Error('Session user id missing');
  }
  return options.page.evaluate(async ({ practiceId, userId }) => {
    const params = new URLSearchParams({ practiceId });
    const response = await fetch(
      `/api/conversations?${params.toString()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          participantUserIds: [userId],
          metadata: { source: 'e2e' }
        })
      }
    );
    const payload = await response.json().catch(() => null) as {
      data?: { id?: string; conversation?: { id?: string } };
      id?: string;
      error?: string;
      message?: string;
    } | null;
    const conversationId = payload?.data?.id
      ?? payload?.data?.conversation?.id
      ?? payload?.id;
    if (!response.ok || !conversationId) {
      const message = payload?.error ?? payload?.message ?? response.statusText;
      throw new Error(`Failed to create conversation: ${response.status} ${message}`);
    }
    return conversationId;
  }, { practiceId: options.practiceId, userId });
};

const openConversationPage = async (options: {
  page: Page;
  practiceSlug: string;
  conversationId: string;
}): Promise<void> => {
  await options.page.goto(
    `/embed/${encodeURIComponent(options.practiceSlug)}/conversations/${encodeURIComponent(options.conversationId)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await waitForSession(options.page, { timeoutMs: 60000 });
  await expect(options.page.getByTestId('chat-container')).toBeVisible({ timeout: 30000 });
};

const expectUserMessage = async (page: Page, content: string, timeoutMs = 15000): Promise<void> => {
  const message = page.getByTestId('user-message').filter({ hasText: content });
  await expect(message).toBeVisible({ timeout: timeoutMs });
};

test.describe('Chat messaging', () => {
  let sharedClientConversationId: string | null = null;
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 60000, retries: 0 });

  test('anonymous guest can send a chat message', async ({ anonContext, anonPage, baseURL }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await anonPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(anonPage, { timeoutMs: 60000 });
    const conversationId = await getOrCreateConversation({
      request: anonContext.request,
      context: anonContext,
      page: anonPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug
    });
    const content = `E2E anon ${Date.now()}`;
    await sendChatMessage({
      page: anonPage,
      baseURL,
      conversationId,
      content
    });
  });

  test('signed-in client can send a chat message', async ({ clientContext, clientPage, baseURL }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await clientPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(clientPage, { timeoutMs: 60000 });
    const conversationId = sharedClientConversationId ?? await getOrCreateConversation({
      request: clientContext.request,
      context: clientContext,
      page: clientPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug
    });
    sharedClientConversationId = conversationId;
    const content = `E2E client ${Date.now()}`;
    await sendChatMessage({
      page: clientPage,
      baseURL,
      conversationId,
      content
    });
  });

  test('practice owner can send a chat message', async ({ ownerContext, ownerPage, baseURL }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await ownerPage.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(ownerPage, { timeoutMs: 60000 });
    const conversationId = sharedClientConversationId ?? await getOrCreateConversation({
      request: ownerContext.request,
      context: ownerContext,
      page: ownerPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug
    });
    if (!sharedClientConversationId) {
      sharedClientConversationId = conversationId;
    }
    const content = `E2E owner ${Date.now()}`;
    await sendChatMessage({
      page: ownerPage,
      baseURL,
      conversationId,
      content
    });
  });

  test('existing conversation syncs for client and practice history', async ({
    clientContext,
    clientPage,
    ownerContext,
    ownerPage,
    baseURL
  }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await clientPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(clientPage, { timeoutMs: 60000 });
    await ownerPage.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(ownerPage, { timeoutMs: 60000 });

    const conversationId = sharedClientConversationId ?? await getOrCreateConversation({
      request: clientContext.request,
      context: clientContext,
      page: clientPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug
    });
    sharedClientConversationId = conversationId;

    const content = `E2E existing ${Date.now()}`;
    const ownerListener = await waitForMessageViaWebSocket({
      page: ownerPage,
      baseURL,
      conversationId,
      content,
      timeoutMs: 10000
    });
    await ownerListener.ready;
    await sendChatMessage({
      page: clientPage,
      baseURL,
      conversationId,
      content
    });

    await ownerListener.wait;
  });

  test('chat UI syncs across tabs and preserves history', async ({ clientContext, clientPage, baseURL }) => {
    if (!e2eConfig) return;
    if (!baseURL) {
      throw new Error('baseURL is required for WebSocket connection');
    }
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await clientPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(clientPage, { timeoutMs: 60000 });
    const conversationId = sharedClientConversationId ?? await createConversationForPage({
      page: clientPage,
      practiceId: e2eConfig.practice.id,
      practiceSlug
    });
    sharedClientConversationId = conversationId;

    const secondaryPage = await clientContext.newPage();
    try {
      await openConversationPage({
        page: clientPage,
        practiceSlug,
        conversationId
      });
      await openConversationPage({
        page: secondaryPage,
        practiceSlug,
        conversationId
      });

      const timestamp = Date.now();
      const firstMessage = `E2E realtime ${timestamp} A`;
      const secondMessage = `E2E realtime ${timestamp} B`;

      await sendChatMessage({
        page: clientPage,
        baseURL,
        conversationId,
        content: firstMessage
      });
      await expectUserMessage(clientPage, firstMessage);
      await expectUserMessage(secondaryPage, firstMessage);

      await sendChatMessage({
        page: secondaryPage,
        baseURL,
        conversationId,
        content: secondMessage
      });
      await expectUserMessage(secondaryPage, secondMessage);
      await expectUserMessage(clientPage, secondMessage);

      await clientPage.reload({ waitUntil: 'domcontentloaded' });
      await waitForSession(clientPage, { timeoutMs: 60000 });
      await expectUserMessage(clientPage, firstMessage);
      await expectUserMessage(clientPage, secondMessage);
    } finally {
      await secondaryPage.close();
    }
  });
});
