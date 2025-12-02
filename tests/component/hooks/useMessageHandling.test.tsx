import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/preact';
import { useEffect } from 'preact/hooks';
import { useMessageHandling } from '@/hooks/useMessageHandling';
import type { ChatMessageUI } from '~/worker/types';
import { getTokenAsync } from '@/lib/tokenStorage';

vi.mock('@/lib/tokenStorage', () => ({
  getTokenAsync: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('@/config/api', () => ({
  getApiConfig: () => ({ baseUrl: 'https://api.example.com' }),
}));

type HookSnapshot = ReturnType<typeof useMessageHandling> | null;

const createFetchResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
}) as unknown as Response;

type HarnessProps = Parameters<typeof useMessageHandling>[0] & {
  onChange: (value: ReturnType<typeof useMessageHandling>) => void;
};

const HookHarness = (props: HarnessProps) => {
  const value = useMessageHandling(props);
  useEffect(() => {
    props.onChange(value);
  }, [value, props]);
  return null;
};

describe('useMessageHandling', () => {
  let latest: HookSnapshot;
  const onError = vi.fn();

  beforeEach(() => {
    latest = null;
    vi.clearAllMocks();
    vi.mocked(getTokenAsync).mockResolvedValue('test-token');
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('requires practice and conversation IDs before sending a message', async () => {
    const fetchMock = vi.fn();
    // @ts-expect-error - assigning mock fetch for tests
    global.fetch = fetchMock;

    render(<HookHarness practiceId={undefined} conversationId={undefined} onError={onError} onChange={(v) => { latest = v; }} />);

    await waitFor(() => expect(latest).not.toBeNull());
    await act(async () => {
      await latest!.sendMessage('hello');
    });

    expect(onError).toHaveBeenCalledWith('Practice ID is required. Please wait a moment and try again.');
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();

    render(<HookHarness practiceId="practice-1" conversationId={undefined} onError={onError} onChange={(v) => { latest = v; }} />);
    await waitFor(() => expect(latest).not.toBeNull());

    await act(async () => {
      await latest!.sendMessage('hello');
    });

    expect(onError).toHaveBeenLastCalledWith('Conversation ID is required for sending messages.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches existing messages when a conversation is available', async () => {
    const fetchMock = vi.fn()
      // Initial history fetch
      .mockResolvedValueOnce(createFetchResponse({
        success: true,
        data: {
          messages: [{
            id: 'm1',
            role: 'assistant',
            content: 'Previous message',
            created_at: '2024-01-01T00:00:00.000Z',
            metadata: {},
          }],
          hasMore: false,
          nextCursor: null,
        },
      }))
      // No further calls expected
      .mockResolvedValue(createFetchResponse({ success: true }));

    // @ts-expect-error - assigning mock fetch for tests
    global.fetch = fetchMock;

    render(
      <HookHarness
        practiceId="practice-1"
        conversationId="conversation-1"
        onError={onError}
        onChange={(v) => { latest = v; }}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/messages'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(latest?.messages).toEqual([
        {
          id: 'm1',
          role: 'assistant',
          content: 'Previous message',
          timestamp: new Date('2024-01-01T00:00:00.000Z').getTime(),
          metadata: {},
          isUser: false,
          files: undefined,
        },
      ]);
    });
  });

  it('replaces optimistic messages and clears stale state on conversation switch', async () => {
    const serverMessage = {
      id: 'real-id',
      role: 'user',
      content: 'hello',
      created_at: '2024-02-01T00:00:00.000Z',
      metadata: {},
    };

    let resolveFetch: ((value: Response) => void) | null = null;
    const fetchPromise = new Promise<Response>((res) => { resolveFetch = res; });

    const fetchMock = vi.fn()
      // Initial history fetch
      .mockResolvedValueOnce(createFetchResponse({
        success: true,
        data: { messages: [], hasMore: false, nextCursor: null },
      }))
      // Send message
      .mockResolvedValueOnce(createFetchResponse({ success: true, data: serverMessage }))
      // History fetch for new conversation (delayed)
      .mockReturnValueOnce(fetchPromise);

    // @ts-expect-error - assigning mock fetch for tests
    global.fetch = fetchMock;

    render(
      <HookHarness
        practiceId="practice-1"
        conversationId="conversation-1"
        onError={onError}
        onChange={(v) => { latest = v; }}
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await latest!.sendMessage('hello');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/messages'),
      expect.objectContaining({ method: 'POST' })
    );

    expect(latest?.messages).toEqual([
      {
        id: 'real-id',
        role: 'user',
        content: 'hello',
        timestamp: new Date('2024-02-01T00:00:00.000Z').getTime(),
        metadata: {},
        isUser: true,
        files: undefined,
      },
    ]);

    // Seed with a fake message to ensure it clears on switch
    act(() => {
      latest?.addMessage({
        id: 'stale',
        role: 'assistant',
        content: 'old',
        isUser: false,
        timestamp: 0,
      } as ChatMessageUI);
    });

    render(
      <HookHarness
        practiceId="practice-1"
        conversationId="conversation-2"
        onError={onError}
        onChange={(v) => { latest = v; }}
      />
    );

    // Messages should clear immediately while waiting for fetch
    await waitFor(() => expect(latest?.messages).toEqual([]));

    // Now resolve the pending fetch for the new conversation
    resolveFetch?.(createFetchResponse({
      success: true,
      data: {
        messages: [{
          id: 'm-new',
          role: 'assistant',
          content: 'new',
          created_at: '2024-03-01T00:00:00.000Z',
          metadata: {},
        }],
        hasMore: false,
        nextCursor: null,
      },
    }));

    await waitFor(() => {
      expect(latest?.messages).toEqual([
        {
          id: 'm-new',
          role: 'assistant',
          content: 'new',
          timestamp: new Date('2024-03-01T00:00:00.000Z').getTime(),
          metadata: {},
          isUser: false,
          files: undefined,
        },
      ]);
    });
  });
});
