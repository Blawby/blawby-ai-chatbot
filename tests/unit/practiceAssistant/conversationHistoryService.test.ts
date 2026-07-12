import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBackendConversationHistory } from '../../../worker/services/practiceAssistant/conversationHistoryService.js';
import type { Env } from '../../../worker/types.js';

const env = { BACKEND_API_URL: 'https://api.example.com/' } as Env;
const request = new Request('https://app.example.com/api/ai/chat', {
  headers: {
    Authorization: 'Bearer session-token',
    Cookie: 'session=cookie',
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadBackendConversationHistory', () => {
  it('loads the latest backend-persisted messages with forwarded authentication', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { latest_seq: 42 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { role: 'system', content: 'hidden' },
          { role: 'user', content: ' Earlier question ' },
          { role: 'assistant', content: 'Earlier answer' },
        ],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadBackendConversationHistory(env, request, 'practice/1', 'conversation/1', 20);

    expect(result).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/intake-conversations/practice%2F1/conversation%2F1',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/intake-conversations/practice%2F1/conversation%2F1/messages?from_seq=23&limit=20',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer session-token');
    expect(headers.get('Cookie')).toBe('session=cookie');
  });

  it('fails fast when the backend response is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));

    await expect(loadBackendConversationHistory(env, request, 'practice', 'conversation')).rejects.toThrow(
      'Conversation history lookup returned malformed JSON',
    );
  });

  it('fails fast when the backend source is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'not replicated' }), { status: 404 })));

    await expect(loadBackendConversationHistory(env, request, 'practice', 'conversation')).rejects.toThrow(
      'Conversation history lookup failed: not replicated',
    );
  });
});
