import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { getCurrentConversationEndpoint, getConversationEndpoint, getConversationWsEndpoint, getChatMessagesEndpoint } from '@/config/api';
import type { Conversation, ConversationMessage, ConversationMessageUI } from '@/shared/types/conversation';

interface UseConversationOptions {
  conversationId: string;
  practiceId?: string;
  onError?: (error: string) => void;
}

interface UseConversationReturn {
  conversation: Conversation | null;
  messages: ConversationMessageUI[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  sendMessage: (content: string, attachments?: string[]) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  hasMore: boolean;
  nextCursor: string | null;
}

const CHAT_PROTOCOL_VERSION = 1;
const SOCKET_READY_TIMEOUT_MS = 8000;
const GAP_FETCH_LIMIT = 50;

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

/**
 * Hook for managing a single conversation
 * Fetches conversation details and messages, uses WebSocket for realtime updates
 */
export function useConversationWithContext(options: Omit<UseConversationOptions, 'practiceId'>): UseConversationReturn {
  const { activePracticeId } = useSessionContext();
  return useConversation({ ...options, practiceId: activePracticeId ?? undefined });
}

/**
 * Hook for getting or creating current conversation for a practice
 * Automatically fetches the current conversation (or creates one) and returns conversation data
 * Note: The API endpoint automatically creates a conversation if one doesn't exist
 */
export function useCurrentConversation(
  practiceId: string | undefined,
  options?: { onError?: (error: string) => void }
): UseConversationReturn & { conversationId: string | null } {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState<boolean>(true);
  const [errorCurrent, setErrorCurrent] = useState<string | null>(null);
  const onErrorRef = useRef(options?.onError);
  
  // Keep onError ref in sync
  useEffect(() => {
    onErrorRef.current = options?.onError;
  }, [options?.onError]);
  
  // Fetch current conversation
  useEffect(() => {
    if (!practiceId) {
      setIsLoadingCurrent(false);
      return;
    }
    
    const fetchCurrent = async () => {
      setIsLoadingCurrent(true);
      setErrorCurrent(null);
      
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        const response = await fetch(
          `${getCurrentConversationEndpoint()}?practiceId=${encodeURIComponent(practiceId)}`,
          {
            method: 'GET',
            headers,
            credentials: 'include',
          }
        );
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json() as { 
          success: boolean; 
          error?: string; 
          data?: { conversation: Conversation } 
        };
        
        if (!data.success || !data.data?.conversation) {
          throw new Error(data.error || 'Failed to get current conversation');
        }
        
        setConversationId(data.data.conversation.id);
        setErrorCurrent(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get conversation';
        setErrorCurrent(errorMessage);
        onErrorRef.current?.(errorMessage);
      } finally {
        setIsLoadingCurrent(false);
      }
    };
    
    fetchCurrent();
  }, [practiceId]); // Only depend on practiceId to avoid infinite re-renders
  
  // Use existing useConversation hook with the conversationId
  const conversationHook = useConversation({ 
    conversationId: conversationId || '', 
    practiceId,
    onError: options?.onError 
  });
  
  // Combine loading states
  const isLoading = isLoadingCurrent || (conversationId ? conversationHook.isLoading : false);
  const error = errorCurrent || conversationHook.error;
  
  return {
    conversation: conversationHook.conversation,
    messages: conversationHook.messages,
    isLoading,
    isLoadingMore: conversationHook.isLoadingMore,
    error,
    sendMessage: conversationHook.sendMessage,
    loadMore: conversationHook.loadMore,
    refresh: conversationHook.refresh,
    hasMore: conversationHook.hasMore,
    nextCursor: conversationHook.nextCursor,
    conversationId,
  };
}

/**
 * Legacy hook that requires practiceId parameter
 * @deprecated Use useConversationWithContext() instead
 */
export function useConversation({
  conversationId,
  practiceId,
  onError,
}: UseConversationOptions): UseConversationReturn {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessageUI[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isDisposedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef<Promise<void> | null>(null);
  const wsReadyResolveRef = useRef<(() => void) | null>(null);
  const wsReadyRejectRef = useRef<((error: Error) => void) | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketSessionRef = useRef(0);
  const isSocketReadyRef = useRef(false);
  const shouldReconnectRef = useRef(true);
  const lastSeqRef = useRef(0);
  const lastReadSeqRef = useRef(0);
  const messageIdSetRef = useRef(new Set<string>());
  const pendingAckRef = useRef(new Map<string, {
    resolve: (ack: { messageId: string; seq: number; serverTs: string; clientId: string }) => void;
    reject: (error: Error) => void;
  }>());
  const pendingClientMessageRef = useRef(new Map<string, string>());

  // Convert API message to UI message
  const toUIMessage = useCallback((msg: ConversationMessage): ConversationMessageUI => {
    return {
      ...msg,
      isUser: msg.role === 'user',
      timestamp: new Date(msg.created_at).getTime(),
      files: msg.metadata?.attachments ? (msg.metadata.attachments as string[]).map((fileId: string) => ({
        id: fileId,
        name: 'File',
        size: 0,
        type: 'application/octet-stream',
        url: '', // TODO: Generate file URL from file ID
      })) : undefined,
    };
  }, []);

  const initSocketReadyPromise = useCallback(() => {
    wsReadyRef.current = new Promise((resolve, reject) => {
      wsReadyResolveRef.current = resolve;
      wsReadyRejectRef.current = reject;
    });
    isSocketReadyRef.current = false;
  }, []);

  const resolveSocketReady = useCallback(() => {
    isSocketReadyRef.current = true;
    wsReadyResolveRef.current?.();
    wsReadyResolveRef.current = null;
    wsReadyRejectRef.current = null;
  }, []);

  const rejectSocketReady = useCallback((error: Error) => {
    isSocketReadyRef.current = false;
    wsReadyRejectRef.current?.(error);
    wsReadyResolveRef.current = null;
    wsReadyRejectRef.current = null;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const flushPendingAcks = useCallback((error: Error) => {
    for (const pending of pendingAckRef.current.values()) {
      pending.reject(error);
    }
    pendingAckRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      flushPendingAcks(new Error('Chat connection closed'));
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [flushPendingAcks]);

  const waitForSocketReady = useCallback(async () => {
    if (!wsReadyRef.current) {
      throw new Error('Chat connection not initialized');
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<void>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Chat connection timed out'));
      }, SOCKET_READY_TIMEOUT_MS);
    });

    try {
      await Promise.race([wsReadyRef.current, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }, []);

  const sendFrame = useCallback((frame: { type: string; data: Record<string, unknown>; request_id?: string }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Chat connection not open');
    }
    ws.send(JSON.stringify(frame));
  }, []);

  const sendReadUpdate = useCallback((seq: number) => {
    if (!conversationId || !isSocketReadyRef.current) {
      return;
    }
    if (seq <= lastReadSeqRef.current) {
      return;
    }
    lastReadSeqRef.current = seq;
    try {
      sendFrame({
        type: 'read.update',
        data: {
          conversation_id: conversationId,
          last_read_seq: seq
        }
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[ChatRoom] Failed to send read.update', error);
      }
    }
  }, [conversationId, sendFrame]);

  const applyServerMessages = useCallback((incoming: ConversationMessage[]) => {
    if (incoming.length === 0 || isDisposedRef.current) {
      return;
    }

    let nextLatestSeq = lastSeqRef.current;
    const replacements = new Map<string, ConversationMessageUI>();
    const additions: ConversationMessageUI[] = [];

    for (const message of incoming) {
      if (!message?.id) {
        continue;
      }
      nextLatestSeq = Math.max(nextLatestSeq, message.seq);
      if (messageIdSetRef.current.has(message.id)) {
        continue;
      }
      messageIdSetRef.current.add(message.id);
      const uiMessage = toUIMessage(message);
      const pendingId = pendingClientMessageRef.current.get(message.client_id);
      if (pendingId) {
        replacements.set(pendingId, uiMessage);
        pendingClientMessageRef.current.delete(message.client_id);
      } else {
        additions.push(uiMessage);
      }
    }

    if (replacements.size === 0 && additions.length === 0) {
      if (nextLatestSeq > lastSeqRef.current) {
        lastSeqRef.current = nextLatestSeq;
        sendReadUpdate(nextLatestSeq);
      }
      return;
    }

    lastSeqRef.current = nextLatestSeq;

    setMessages(prev => {
      let next = prev;
      if (replacements.size > 0) {
        next = next.map(message => {
          const replacement = replacements.get(message.id);
          if (!replacement) {
            return message;
          }
          return {
            ...replacement,
            files: replacement.files ?? message.files
          } as ConversationMessageUI;
        });
      } else {
        next = [...next];
      }

      if (additions.length > 0) {
        next = [...next, ...additions];
      }

      return next.sort((a, b) => a.timestamp - b.timestamp);
    });

    sendReadUpdate(nextLatestSeq);
  }, [sendReadUpdate, toUIMessage]);

  const handleMessageAck = useCallback((data: Record<string, unknown>) => {
    const clientId = typeof data.client_id === 'string' ? data.client_id : null;
    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const seqValue = typeof data.seq === 'number' ? data.seq : Number(data.seq);
    const serverTs = typeof data.server_ts === 'string' ? data.server_ts : null;
    if (!clientId || !messageId || !serverTs || !Number.isFinite(seqValue)) {
      return;
    }

    const pending = pendingAckRef.current.get(clientId);
    if (pending) {
      pending.resolve({ messageId, seq: seqValue, serverTs, clientId });
      pendingAckRef.current.delete(clientId);
    }

    messageIdSetRef.current.add(messageId);
    lastSeqRef.current = Math.max(lastSeqRef.current, seqValue);

    const pendingId = pendingClientMessageRef.current.get(clientId);
    if (!pendingId) {
      sendReadUpdate(lastSeqRef.current);
      return;
    }

    pendingClientMessageRef.current.delete(clientId);
    setMessages(prev => prev.map(message => {
      if (message.id !== pendingId) {
        return message;
      }
      const nextTimestamp = new Date(serverTs).getTime();
      return {
        ...message,
        id: messageId,
        seq: seqValue,
        server_ts: serverTs,
        created_at: serverTs,
        timestamp: nextTimestamp
      };
    }));
    sendReadUpdate(lastSeqRef.current);
  }, [sendReadUpdate]);

  const handleMessageNew = useCallback((data: Record<string, unknown>) => {
    const conversationIdValue = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    if (!conversationIdValue || conversationIdValue !== conversationId) {
      return;
    }

    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const clientId = typeof data.client_id === 'string' ? data.client_id : null;
    const content = typeof data.content === 'string' ? data.content : null;
    const role = typeof data.role === 'string' ? data.role : null;
    const serverTs = typeof data.server_ts === 'string' ? data.server_ts : null;
    const seqValue = typeof data.seq === 'number' ? data.seq : Number(data.seq);
    if (!messageId || !clientId || !content || !serverTs || !Number.isFinite(seqValue)) {
      return;
    }

    const metadata = typeof data.metadata === 'object' && data.metadata !== null && !Array.isArray(data.metadata)
      ? data.metadata as Record<string, unknown>
      : null;
    const attachments = Array.isArray(data.attachments)
      ? (data.attachments as string[]).filter((item) => typeof item === 'string')
      : [];

    const message: ConversationMessage = {
      id: messageId,
      conversation_id: conversationIdValue,
      practice_id: practiceId || '',
      user_id: typeof data.user_id === 'string' ? data.user_id : '',
      role: role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user',
      content,
      metadata: metadata ?? (attachments.length > 0 ? { attachments } : null),
      client_id: clientId,
      seq: seqValue,
      server_ts: serverTs,
      token_count: null,
      created_at: serverTs
    };

    applyServerMessages([message]);
  }, [applyServerMessages, conversationId, practiceId]);

  const fetchGapMessages = useCallback(async (
    fromSeq: number,
    latestSeq: number,
    signal?: AbortSignal
  ) => {
    if (!conversationId || !practiceId) {
      return;
    }

    let nextSeq: number | null = fromSeq;
    let targetLatest = latestSeq;
    let attempt = 0;

    while (nextSeq !== null && nextSeq <= targetLatest && !signal?.aborted) {
      try {
        const params = new URLSearchParams({
          conversationId,
          practiceId,
          from_seq: String(nextSeq),
          limit: String(GAP_FETCH_LIMIT)
        });

        const response = await fetch(`${getChatMessagesEndpoint()}?${params.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json() as {
          success: boolean;
          error?: string;
          data?: {
            messages: ConversationMessage[];
            latest_seq?: number;
            next_from_seq?: number | null;
          };
        };
        if (!data.success || !data.data) {
          throw new Error(data.error || 'Failed to fetch message gap');
        }

        applyServerMessages(data.data.messages ?? []);
        if (typeof data.data.latest_seq === 'number') {
          targetLatest = data.data.latest_seq;
        }
        nextSeq = data.data.next_from_seq ?? null;
        attempt = 0;
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }
        attempt += 1;
        if (attempt >= 3) {
          const message = error instanceof Error ? error.message : 'Failed to recover message gap';
          setError(message);
          onError?.(message);
          shouldReconnectRef.current = false;
          wsRef.current?.close();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 400 * attempt));
      }
    }
  }, [applyServerMessages, conversationId, practiceId, onError]);

  const connectChatRoom = useCallback(() => {
    if (!conversationId) {
      return;
    }
    if (typeof WebSocket === 'undefined') {
      const message = 'WebSocket is not available in this environment.';
      setError(message);
      onError?.(message);
      return;
    }
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      isSocketReadyRef.current
    ) {
      return;
    }

    shouldReconnectRef.current = true;
    clearReconnectTimer();
    socketSessionRef.current += 1;
    const sessionId = socketSessionRef.current;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    initSocketReadyPromise();

    const ws = new WebSocket(getConversationWsEndpoint(conversationId));
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'auth',
        data: {
          protocol_version: CHAT_PROTOCOL_VERSION,
          client_info: { platform: 'web' }
        }
      }));
    });

    ws.addEventListener('message', (event) => {
      if (socketSessionRef.current !== sessionId || typeof event.data !== 'string') {
        return;
      }
      let frame: { type?: string; data?: Record<string, unknown>; request_id?: string };
      try {
        frame = JSON.parse(event.data) as { type?: string; data?: Record<string, unknown>; request_id?: string };
      } catch {
        return;
      }
      if (!frame.type || !frame.data || typeof frame.data !== 'object') {
        return;
      }

      switch (frame.type) {
        case 'auth.ok': {
          resolveSocketReady();
          try {
            sendFrame({
              type: 'resume',
              data: {
                conversation_id: conversationId,
                last_seq: lastSeqRef.current
              }
            });
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn('[ChatRoom] Failed to send resume', error);
            }
          }
          return;
        }
        case 'auth.error': {
          const message = typeof frame.data.message === 'string' ? frame.data.message : 'Chat protocol error';
          setError(message);
          onError?.(message);
          rejectSocketReady(new Error(message));
          shouldReconnectRef.current = false;
          ws.close();
          return;
        }
        case 'resume.ok': {
          const latestSeq = Number(frame.data.latest_seq);
          if (Number.isFinite(latestSeq)) {
            lastSeqRef.current = Math.max(lastSeqRef.current, latestSeq);
            sendReadUpdate(lastSeqRef.current);
          }
          return;
        }
        case 'resume.gap': {
          const fromSeq = Number(frame.data.from_seq);
          const latestSeq = Number(frame.data.latest_seq);
          if (Number.isFinite(fromSeq) && Number.isFinite(latestSeq)) {
            fetchGapMessages(fromSeq, latestSeq, abortControllerRef.current?.signal).catch((error) => {
              if (import.meta.env.DEV) {
                console.warn('[ChatRoom] Gap fetch failed', error);
              }
            });
          }
          return;
        }
        case 'message.new':
          handleMessageNew(frame.data);
          return;
        case 'message.ack':
          handleMessageAck(frame.data);
          return;
        case 'error': {
          const message = typeof frame.data.message === 'string' ? frame.data.message : 'Chat error';
          const requestId = typeof frame.request_id === 'string' ? frame.request_id : null;
          if (requestId) {
            const pending = pendingAckRef.current.get(requestId);
            if (pending) {
              pending.reject(new Error(message));
              pendingAckRef.current.delete(requestId);
            }
          }
          setError(message);
          onError?.(message);
          return;
        }
        default:
          return;
      }
    });

    ws.addEventListener('close', () => {
      if (socketSessionRef.current !== sessionId) {
        return;
      }
      isSocketReadyRef.current = false;
      rejectSocketReady(new Error('Chat connection closed'));
      flushPendingAcks(new Error('Chat connection closed'));
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (!conversationId || !shouldReconnectRef.current) {
        return;
      }
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectChatRoom();
        }, 2000);
      }
    });

    ws.addEventListener('error', (error) => {
      if (import.meta.env.DEV) {
        console.warn('[ChatRoom] WebSocket error', error);
      }
    });
  }, [
    clearReconnectTimer,
    conversationId,
    fetchGapMessages,
    flushPendingAcks,
    handleMessageAck,
    handleMessageNew,
    initSocketReadyPromise,
    onError,
    rejectSocketReady,
    resolveSocketReady,
    sendFrame,
    sendReadUpdate
  ]);

  const closeChatSocket = useCallback(() => {
    clearReconnectTimer();
    isSocketReadyRef.current = false;
    shouldReconnectRef.current = false;
    rejectSocketReady(new Error('Chat connection closed'));
    flushPendingAcks(new Error('Chat connection closed'));
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearReconnectTimer, flushPendingAcks, rejectSocketReady]);

  const sendMessageOverWs = useCallback(async (
    content: string,
    attachments?: string[]
  ) => {
    if (!conversationId || !practiceId) {
      throw new Error('Conversation ID and practice ID are required');
    }
    if (!content.trim()) {
      throw new Error('Message cannot be empty.');
    }

    const clientId = createClientId();
    const tempId = `temp-${clientId}`;
    const nowIso = new Date().toISOString();
    const tempMessage: ConversationMessageUI = {
      id: tempId,
      conversation_id: conversationId,
      practice_id: practiceId,
      user_id: '',
      role: 'user',
      content,
      metadata: attachments?.length ? { attachments } : null,
      client_id: clientId,
      seq: 0,
      server_ts: nowIso,
      token_count: null,
      created_at: nowIso,
      isUser: true,
      timestamp: Date.now(),
      files: attachments ? attachments.map((fileId) => ({
        id: fileId,
        name: 'File',
        size: 0,
        type: 'application/octet-stream',
        url: ''
      })) : undefined
    };

    setMessages(prev => [...prev, tempMessage]);
    pendingClientMessageRef.current.set(clientId, tempId);

    const ackPromise = new Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }>((resolve, reject) => {
      pendingAckRef.current.set(clientId, { resolve, reject });
    });

    try {
      if (!wsReadyRef.current) {
        connectChatRoom();
      }
      await waitForSocketReady();
      sendFrame({
        type: 'message.send',
        data: {
          conversation_id: conversationId,
          client_id: clientId,
          content,
          ...(attachments && attachments.length > 0 ? { attachments } : {})
        },
        request_id: clientId
      });
    } catch (error) {
      pendingAckRef.current.delete(clientId);
      pendingClientMessageRef.current.delete(clientId);
      setMessages(prev => prev.filter(message => message.id !== tempId));
      throw error;
    }

    return ackPromise.catch((error) => {
      pendingClientMessageRef.current.delete(clientId);
      setMessages(prev => prev.filter(message => message.id !== tempId));
      throw error;
    });
  }, [connectChatRoom, conversationId, practiceId, sendFrame, waitForSocketReady]);

  // Fetch conversation details
  const fetchConversation = useCallback(async () => {
    if (!conversationId || !practiceId) {
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      const response = await fetch(`${getConversationEndpoint(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: Conversation };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch conversation');
      }

      if (!isDisposedRef.current) {
        setConversation(data.data);
        setError(null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversation';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [conversationId, practiceId, onError]);

  // Fetch messages
  const fetchMessages = useCallback(async (options?: { cursor?: string; isLoadMore?: boolean }) => {
    if (!conversationId || !practiceId) {
      return;
    }

    const loadingState = options?.isLoadMore ? setIsLoadingMore : setIsLoading;
    loadingState(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      const params = new URLSearchParams({
        conversationId,
        practiceId,
        limit: '50',
      });

      if (options?.cursor) {
        params.set('cursor', options.cursor);
      }

      const response = await fetch(`${getChatMessagesEndpoint()}?${params.toString()}`, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        success: boolean;
        error?: string;
        data?: {
          messages: ConversationMessage[];
          hasMore?: boolean;
          cursor?: string | null;
        };
      };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

      if (!isDisposedRef.current) {
        const uiMessages = data.data.messages.map(toUIMessage);

        if (options?.isLoadMore) {
          setMessages(prev => {
            const merged = [...uiMessages, ...prev];
            return merged.sort((a, b) => a.timestamp - b.timestamp);
          });
          data.data.messages.forEach((msg) => {
            messageIdSetRef.current.add(msg.id);
            const seqValue = typeof msg.seq === 'number' ? msg.seq : Number(msg.seq);
            if (Number.isFinite(seqValue)) {
              lastSeqRef.current = Math.max(lastSeqRef.current, seqValue);
            }
          });
        } else {
          const serverMessageIds = new Set(data.data.messages.map((msg) => msg.id));
          const pendingIds = new Set(pendingClientMessageRef.current.values());
          lastSeqRef.current = data.data.messages.reduce((max, msg) => {
            const seqValue = typeof msg.seq === 'number' && Number.isFinite(msg.seq) ? msg.seq : null;
            return seqValue !== null ? Math.max(max, seqValue) : max;
          }, 0);

          setMessages(prev => {
            const optimistic = prev.filter((message) => {
              return pendingIds.has(message.id) || message.id.startsWith('temp-');
            });
            const mergedIds = new Set(uiMessages.map((message) => message.id));
            const merged = [
              ...uiMessages,
              ...optimistic.filter((message) => !mergedIds.has(message.id))
            ].sort((a, b) => a.timestamp - b.timestamp);

            const nextIds = new Set(serverMessageIds);
            for (const message of optimistic) {
              nextIds.add(message.id);
            }
            messageIdSetRef.current = nextIds;

            return merged;
          });
          sendReadUpdate(lastSeqRef.current);
        }

        setHasMore(Boolean(data.data.hasMore));
        setNextCursor(data.data.cursor ?? null);
        setError(null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      if (!isDisposedRef.current) {
        loadingState(false);
      }
    }
  }, [conversationId, practiceId, toUIMessage, onError, sendReadUpdate]);

  // Send message
  const sendMessage = useCallback(async (content: string, attachments?: string[]) => {
    try {
      await sendMessageOverWs(content, attachments);
      await fetchConversation();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      onError?.(errorMessage);
      throw err;
    }
  }, [fetchConversation, onError, sendMessageOverWs]);

  // Load more messages (pagination)
  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }
    await fetchMessages({ cursor: nextCursor, isLoadMore: true });
  }, [nextCursor, isLoadingMore, fetchMessages]);

  // Refresh messages
  const refresh = useCallback(async () => {
    await Promise.all([fetchConversation(), fetchMessages()]);
  }, [fetchConversation, fetchMessages]);

  // Initial load
  useEffect(() => {
    if (!conversationId || !practiceId) {
      setIsLoading(false);
      closeChatSocket();
      return;
    }

    messageIdSetRef.current.clear();
    pendingClientMessageRef.current.clear();
    lastSeqRef.current = 0;
    lastReadSeqRef.current = 0;

    abortControllerRef.current = new AbortController();
    Promise.all([fetchConversation(), fetchMessages()]).finally(() => {
      if (!isDisposedRef.current) {
        setIsLoading(false);
      }
    });
    connectChatRoom();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      closeChatSocket();
    };
  }, [conversationId, practiceId, closeChatSocket, connectChatRoom, fetchConversation, fetchMessages]); // Only run on mount or when IDs change

  return {
    conversation,
    messages,
    isLoading,
    isLoadingMore,
    error,
    sendMessage,
    loadMore,
    refresh,
    hasMore,
    nextCursor,
  };
}
