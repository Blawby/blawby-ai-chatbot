import type { Env } from '../../types.js';

export interface PracticeAssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const PROJECTION_RETRY_DELAYS_MS = [0, 100, 300, 700] as const;

const getBackendBaseUrl = (env: Env): string => {
  const base = env.BACKEND_API_URL?.trim();
  if (!base) throw new Error('BACKEND_API_URL is required for conversation history');
  return base.replace(/\/+$/, '');
};

const forwardHeaders = (request: Request): Headers => {
  const headers = new Headers({ Accept: 'application/json' });
  const cookie = request.headers.get('Cookie');
  const authorization = request.headers.get('Authorization');
  if (cookie) headers.set('Cookie', cookie);
  if (authorization) headers.set('Authorization', authorization);
  return headers;
};

const fetchJson = async (url: string, headers: Headers, label: string): Promise<unknown> => {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
  if (!response.ok) {
    const record = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const message = typeof record.message === 'string' ? record.message : `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }
  return payload;
};

const unwrapData = (payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  return (payload as Record<string, unknown>).data;
};

export const loadBackendConversationHistory = async (
  env: Env,
  request: Request,
  practiceId: string,
  conversationId: string,
  expectedLatestSeq: number,
  limit = 20,
): Promise<PracticeAssistantHistoryMessage[]> => {
  const base = getBackendBaseUrl(env);
  const headers = forwardHeaders(request);
  const resource = `${base}/api/intake-conversations/${encodeURIComponent(practiceId)}/${encodeURIComponent(conversationId)}`;
  let latestSeq = -1;
  for (const [attempt, delayMs] of PROJECTION_RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const conversation = unwrapData(await fetchJson(resource, headers, 'Conversation history lookup'));
    if (!conversation || typeof conversation !== 'object' || Array.isArray(conversation)) {
      throw new Error('Conversation history lookup returned an invalid conversation');
    }
    const projectedSeq = (conversation as Record<string, unknown>).latest_seq;
    if (typeof projectedSeq !== 'number' || !Number.isInteger(projectedSeq) || projectedSeq < 0) {
      throw new Error('Conversation history lookup returned an invalid latest_seq');
    }
    latestSeq = projectedSeq;
    if (latestSeq >= expectedLatestSeq) break;
    if (attempt === PROJECTION_RETRY_DELAYS_MS.length - 1) {
      throw new Error(`Conversation history projection is behind: expected seq ${expectedLatestSeq}, received ${latestSeq}`);
    }
  }

  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const fromSeq = Math.max(0, latestSeq - boundedLimit + 1);
  const messagesUrl = `${resource}/messages?from_seq=${fromSeq}&limit=${boundedLimit}`;
  const messages = unwrapData(await fetchJson(messagesUrl, headers, 'Conversation messages lookup'));
  if (!Array.isArray(messages)) {
    throw new Error('Conversation messages lookup returned an invalid message list');
  }

  return messages.flatMap((message): PracticeAssistantHistoryMessage[] => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return [];
    const record = message as Record<string, unknown>;
    if ((record.role !== 'user' && record.role !== 'assistant') || typeof record.content !== 'string') return [];
    const content = record.content.trim();
    return content ? [{ role: record.role, content }] : [];
  });
};
