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

interface ConversationSummary {
  id?: string;
  status?: string;
  updated_at?: string;
  last_message_at?: string | null;
  latest_seq?: number | null;
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

const summarizeCookieHeader = (cookieHeader: string): string[] => (
  cookieHeader
    .split(';')
    .map((segment) => segment.split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name))
);

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

  const conversationPath = `/api/conversations/${encodeURIComponent(options.conversationId)}?practiceId=${encodeURIComponent(options.practiceId)}`;
  const conversationCheck = await fetchDebugResponse(options.request, conversationPath, headers);

  let conversationSlugCheck: { url: string; status: number; body: string } | undefined;
  let messagesSlugCheck: { url: string; status: number; body: string } | undefined;
  if (options.practiceSlug && options.practiceSlug !== options.practiceId) {
    const slugConversationPath = `/api/conversations/${encodeURIComponent(options.conversationId)}?practiceId=${encodeURIComponent(options.practiceSlug)}`;
    conversationSlugCheck = await fetchDebugResponse(options.request, slugConversationPath, headers);

    const slugMessagesPath = `/api/conversations/${encodeURIComponent(options.conversationId)}/messages?practiceId=${encodeURIComponent(options.practiceSlug)}&limit=50`;
    messagesSlugCheck = await fetchDebugResponse(options.request, slugMessagesPath, headers);
  }

  console.warn('[E2E][chat] Message fetch failed', {
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

    const params = new URLSearchParams({ practiceId: options.practiceId });
    if (options.practiceSlug) {
      params.set('practiceSlug', options.practiceSlug);
    }
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

const getExistingConversationId = async (options: {
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
      await waitForSession(options.page, {
        timeoutMs: 30000,
        skipIfCookiePresent: false,
        cookieUrl: options.baseURL
      });
      cookieHeader = await buildCookieHeader(options.context, options.baseURL);
    }
    return cookieHeader;
  };

  const fetchConversationList = async (
    status?: 'active' | 'archived' | 'closed'
  ): Promise<ConversationSummary[]> => {
    const params = new URLSearchParams({
      practiceId: options.practiceId,
      limit: '20'
    });
    if (status) {
      params.set('status', status);
    }
    if (options.practiceSlug) {
      params.set('practiceSlug', options.practiceSlug);
    }
    const url = `/api/conversations?${params.toString()}`;
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
      let payload: { data?: { conversations?: ConversationSummary[] } } | null = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText) as { data?: { conversations?: ConversationSummary[] } };
        } catch {
          payload = null;
        }
      }

      const conversations = payload?.data?.conversations ?? (payload as { conversations?: ConversationSummary[] } | null)?.conversations;
      if (response.ok() && Array.isArray(conversations)) {
        return conversations;
      }

      const fallbackText = payload ? JSON.stringify(payload) : rawText;
      lastError = new Error(`Failed to fetch conversations: ${response.status()} ${fallbackText.slice(0, 300)}`);

      const statusCode = response.status();
      const retriable = statusCode === 401 || statusCode === 429 || statusCode >= 500;
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

    throw lastError ?? new Error('Failed to fetch conversations after retries');
  };

  const activeConversations = await fetchConversationList('active');
  const conversations = activeConversations.length
    ? activeConversations
    : await fetchConversationList();
  const preferred = conversations.find((conversation) => (
    Boolean(conversation?.last_message_at)
    || (typeof conversation?.latest_seq === 'number' && conversation.latest_seq > 0)
  )) ?? conversations.find((conversation) => conversation?.id);

  if (!preferred?.id) {
    throw new Error(
      `No existing conversations found for practice ${options.practiceId}. Seed a conversation for the E2E client before running this test.`
    );
  }

  return preferred.id;
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
  practiceSlug?: string;
  conversationId: string;
}): Promise<ConversationMessage[]> => {
  const url = `/api/conversations/${encodeURIComponent(options.conversationId)}/messages?practiceId=${encodeURIComponent(options.practiceId)}&limit=50`;
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
      await logMessageFetchDiagnostics({
        request: options.request,
        baseURL: options.baseURL,
        practiceId: options.practiceId,
        practiceSlug: options.practiceSlug,
        conversationId: options.conversationId,
        cookieHeader,
        status,
        url: response.url(),
        body: fallbackText
      });
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

const waitForMessageInHistory = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  page?: Page;
  baseURL: string;
  practiceId: string;
  practiceSlug?: string;
  conversationId: string;
  content: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const messages = await getConversationMessages({
      request: options.request,
      context: options.context,
      page: options.page,
      baseURL: options.baseURL,
      practiceId: options.practiceId,
      practiceSlug: options.practiceSlug,
      conversationId: options.conversationId
    });

    if (messages.some((message) => message.content === options.content)) {
      return;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for message to appear in history: "${options.content}"`);
};

const createConversationForPage = async (options: {
  page: Page;
  practiceId: string;
  practiceSlug?: string;
}): Promise<string> => {
  return options.page.evaluate(async ({ practiceId, practiceSlug }) => {
    const sessionResponse = await fetch('/api/auth/get-session', { credentials: 'include' });
    if (!sessionResponse.ok) {
      throw new Error(`Failed to load session: ${sessionResponse.status}`);
    }
    const sessionData = await sessionResponse.json().catch(() => null) as {
      user?: { id?: string };
      session?: { user?: { id?: string } };
      data?: { user?: { id?: string }; session?: { user?: { id?: string } } };
    } | null;
    const userId = sessionData?.user?.id
      ?? sessionData?.data?.user?.id
      ?? sessionData?.session?.user?.id
      ?? sessionData?.data?.session?.user?.id;
    if (!userId) {
      throw new Error('Session user id missing');
    }
    const params = new URLSearchParams({ practiceId });
    if (practiceSlug) {
      params.set('practiceSlug', practiceSlug);
    }
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
  }, { practiceId: options.practiceId, practiceSlug: options.practiceSlug });
};

const openConversationPage = async (options: {
  page: Page;
  practiceSlug: string;
  conversationId: string;
}): Promise<void> => {
  await options.page.goto(
    `/p/${encodeURIComponent(options.practiceSlug)}/chats/${encodeURIComponent(options.conversationId)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await waitForSession(options.page, { timeoutMs: 60000 });
  await expect(options.page.getByTestId('chat-container')).toBeVisible({ timeout: 30000 });
  await expect(options.page.getByTestId('message-input')).toBeVisible({ timeout: 30000 });
};

const ensureComposerReady = async (page: Page): Promise<void> => {
  const input = page.getByTestId('message-input');
  await expect(input).toBeVisible({ timeout: 30000 });
  if (await input.isDisabled()) {
    const askButton = page.getByRole('button', { name: /ask a question/i });
    if (await askButton.isVisible()) {
      if (!(await askButton.isEnabled())) {
        await expect(askButton).toBeEnabled({ timeout: 30000 });
      }
      await askButton.click();
    }
    await expect(input).toBeEnabled({ timeout: 30000 });
  }
};

const expectUserMessage = async (page: Page, content: string, timeoutMs = 15000): Promise<void> => {
  const message = page.getByTestId('user-message').filter({ hasText: content });
  await expect(message).toBeVisible({ timeout: timeoutMs });
};

const sendMessageFromComposer = async (page: Page, content: string): Promise<void> => {
  await ensureComposerReady(page);
  const input = page.getByTestId('message-input');
  await input.fill(content);
  await page.getByTestId('message-send-button').click();
  await expectUserMessage(page, content);
};

test.describe('Chat messaging', () => {
  test.skip(!e2eConfig, 'E2E credentials are not configured.');
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  test('anonymous guest can send a chat message', async ({ anonContext, anonPage, baseURL }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await anonPage.goto(`/p/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
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
      practiceSlug,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
  });

  test('signed-in client can send a chat message', async ({ clientContext, clientPage, baseURL }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await clientPage.goto(`/p/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(clientPage, { timeoutMs: 60000 });
    const conversationId = await getOrCreateConversation({
      request: clientContext.request,
      context: clientContext,
      page: clientPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug
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
      practiceSlug,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
  });

  test('practice owner can send a chat message', async ({ ownerContext, ownerPage, baseURL }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await ownerPage.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(ownerPage, { timeoutMs: 60000 });
    const conversationId = await getOrCreateConversation({
      request: ownerContext.request,
      context: ownerContext,
      page: ownerPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug
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
      practiceSlug,
      conversationId
    });

    expect(messages.some((message) => message.content === content)).toBeTruthy();
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
    await clientPage.goto(`/p/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(clientPage, { timeoutMs: 60000 });
    await ownerPage.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSession(ownerPage, { timeoutMs: 60000 });

    const conversationId = await getExistingConversationId({
      request: clientContext.request,
      context: clientContext,
      page: clientPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug
    });

    const content = `E2E existing ${Date.now()}`;
    await sendChatMessageWithRetry({
      page: clientPage,
      baseURL,
      conversationId,
      content
    });

    await waitForMessageInHistory({
      request: clientContext.request,
      context: clientContext,
      page: clientPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug,
      conversationId,
      content
    });

    await waitForMessageInHistory({
      request: ownerContext.request,
      context: ownerContext,
      page: ownerPage,
      baseURL,
      practiceId: e2eConfig.practice.id,
      practiceSlug,
      conversationId,
      content
    });
  });

  test('chat UI syncs across tabs and preserves history', async ({ clientContext, clientPage }) => {
    if (!e2eConfig) return;
    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await clientPage.goto(`/p/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(clientPage, { timeoutMs: 60000 });
    const conversationId = await createConversationForPage({
      page: clientPage,
      practiceId: e2eConfig.practice.id,
      practiceSlug
    });

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

      await sendMessageFromComposer(clientPage, firstMessage);
      await expectUserMessage(secondaryPage, firstMessage);

      await sendMessageFromComposer(secondaryPage, secondMessage);
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
