import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { ChatMessageUI, FileAttachment } from '../../../worker/types';
import { ContactData } from '@/features/intake/components/ContactForm';
import { getChatMessagesEndpoint, getConversationWsEndpoint, getIntakeConfirmEndpoint } from '@/config/api';
import { submitContactForm } from '@/shared/utils/forms';
import { buildIntakePaymentUrl, fetchIntakePaymentStatus, isPaidIntakeStatus } from '@/shared/utils/intakePayments';
import type { Conversation, ConversationMessage, ConversationMetadata, ConversationMode, FirstMessageIntent } from '@/shared/types/conversation';
import { updateConversationMetadata as patchConversationMetadata } from '@/shared/lib/conversationApi';

// Global interface for window API base override and debug properties
declare global {
  interface Window {
    __API_BASE__?: string;
    __DEBUG_AI_MESSAGES__?: (messages: ChatMessageUI[]) => void;
    __DEBUG_SEND_MESSAGE__?: (message: string, attachments: FileAttachment[]) => void;
    __DEBUG_CONTACT_FORM__?: (contactData: ContactData | Record<string, boolean>, message: string) => void;
  }
}

interface UseMessageHandlingOptions {
  practiceId?: string;
  practiceSlug?: string;
  conversationId?: string; // Required for user-to-user chat
  mode?: ConversationMode | null;
  onConversationMetadataUpdated?: (metadata: ConversationMetadata | null) => void;
  onError?: (error: string) => void;
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
 * Hook that uses blawby-ai practice for all message handling
 * This is the preferred way to use message handling in components
 */
export const useMessageHandlingWithContext = ({ conversationId, onError }: Omit<UseMessageHandlingOptions, 'practiceId'>) => {
  const { activePracticeId } = useSessionContext();
  return useMessageHandling({ practiceId: activePracticeId ?? undefined, conversationId, onError });
};

/**
 * Legacy hook that requires practiceId parameter
 * @deprecated Use useMessageHandlingWithContext() instead
 * 
 * Note: For user-to-user chat, conversationId is required.
 * This hook will fetch messages on mount if conversationId is provided.
 */
export const useMessageHandling = ({
  practiceId,
  practiceSlug,
  conversationId,
  mode,
  onConversationMetadataUpdated,
  onError
}: UseMessageHandlingOptions) => {
  const { session, isPending } = useSessionContext();
  const sessionReady = Boolean(session?.user) && !isPending;
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const abortControllerRef = useRef<globalThis.AbortController | null>(null);
  const consultFlowAbortRef = useRef<globalThis.AbortController | null>(null);
  const intentAbortRef = useRef<globalThis.AbortController | null>(null);
  const metadataUpdateQueueRef = useRef<Promise<Conversation | null>>(Promise.resolve(null));
  const isDisposedRef = useRef(false);
  const lastConversationIdRef = useRef<string | undefined>();
  const conversationIdRef = useRef<string | undefined>();
  const practiceIdRef = useRef<string | undefined>();
  const conversationMetadataRef = useRef<ConversationMetadata | null>(null);
  const hasLoggedIntentRef = useRef(false);
  const [isConsultFlowActive, setIsConsultFlowActive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef<Promise<void> | null>(null);
  const wsReadyResolveRef = useRef<(() => void) | null>(null);
  const wsReadyRejectRef = useRef<((error: Error) => void) | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const socketSessionRef = useRef(0);
  const isSocketReadyRef = useRef(false);
  const lastSeqRef = useRef(0);
  const lastReadSeqRef = useRef(0);
  const messageIdSetRef = useRef(new Set<string>());
  const pendingAckRef = useRef(new Map<string, {
    resolve: (ack: { messageId: string; seq: number; serverTs: string; clientId: string }) => void;
    reject: (error: Error) => void;
  }>());
  const pendingClientMessageRef = useRef(new Map<string, string>());
  const connectChatRoomRef = useRef<(conversationId: string) => void>(() => {});
  const isClosingSocketRef = useRef(false);
  conversationIdRef.current = conversationId;
  practiceIdRef.current = practiceId;
  
  // Debug hooks for test environment (development only)
  useEffect(() => {
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
      window.__DEBUG_AI_MESSAGES__ = (messages: ChatMessageUI[]) => {
        console.log('[TEST] Current messages:', messages.map((m) => ({ role: m.role, isUser: m.isUser, id: m.id })));
      };
      window.__DEBUG_AI_MESSAGES__?.(messages);
    }
  }, [messages]);

  const logDev = useCallback((message: string, data?: unknown) => {
    if (import.meta.env.DEV) {
      console.log(message, data);
    }
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

  const resetRealtimeState = useCallback(() => {
    messageIdSetRef.current.clear();
    pendingClientMessageRef.current.clear();
    lastSeqRef.current = 0;
    lastReadSeqRef.current = 0;
  }, []);

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
    const activeConversationId = conversationIdRef.current;
    if (!activeConversationId || !isSocketReadyRef.current) {
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
          conversation_id: activeConversationId,
          last_read_seq: seq
        }
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[ChatRoom] Failed to send read.update', error);
      }
    }
  }, [sendFrame]);

  const applyConversationMetadata = useCallback((metadata: ConversationMetadata | null) => {
    conversationMetadataRef.current = metadata;
    hasLoggedIntentRef.current = Boolean(metadata?.first_message_intent);
    onConversationMetadataUpdated?.(metadata);
  }, [onConversationMetadataUpdated]);

  const updateConversationMetadata = useCallback(async (
    patch: ConversationMetadata,
    targetConversationId?: string
  ) => {
    if (!sessionReady) {
      return null;
    }
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) {
      return null;
    }
    const runUpdate = async () => {
      const current = conversationMetadataRef.current ?? {};
      const nextMetadata = { ...current, ...patch };
      applyConversationMetadata(nextMetadata);
      const updated = await patchConversationMetadata(activeConversationId, practiceId, nextMetadata);
      applyConversationMetadata(updated?.user_info ?? nextMetadata);
      return updated;
    };

    const queued = metadataUpdateQueueRef.current.then(runUpdate, runUpdate);
    metadataUpdateQueueRef.current = queued.catch(() => null);
    return queued;
  }, [applyConversationMetadata, conversationId, practiceId, sessionReady]);

  const fetchConversationMetadata = useCallback(async (
    signal?: AbortSignal,
    targetConversationId?: string
  ) => {
    if (!sessionReady) return;
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(activeConversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
      {
        method: 'GET',
        headers,
        credentials: 'include',
        signal
      }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    const data = await response.json() as { success: boolean; data?: { user_info?: ConversationMetadata | null } };
    if (signal?.aborted || isDisposedRef.current) return;
    if (activeConversationId !== conversationIdRef.current) return;
    applyConversationMetadata(data.data?.user_info ?? null);
  }, [applyConversationMetadata, conversationId, practiceId, sessionReady]);

  // Convert API message to UI message
  const toUIMessage = useCallback((msg: ConversationMessage): ChatMessageUI => {
    const baseMessage = {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.created_at).getTime(),
      metadata: msg.metadata || undefined,
      files: msg.metadata?.attachments ? (msg.metadata.attachments as string[]).map((fileId: string) => ({
        id: fileId,
        name: 'File',
        size: 0,
        type: 'application/octet-stream',
        url: '', // TODO: Generate file URL from file ID
      })) : undefined,
    };

    // Return properly typed variant based on role
    if (msg.role === 'user') {
      return { ...baseMessage, role: 'user', isUser: true } as ChatMessageUI;
    } else if (msg.role === 'system') {
      return { ...baseMessage, role: 'system', isUser: false } as ChatMessageUI;
    } else {
      return { ...baseMessage, role: 'assistant', isUser: false } as ChatMessageUI;
    }
  }, []);

  const applyServerMessages = useCallback((incoming: ConversationMessage[]) => {
    if (incoming.length === 0 || isDisposedRef.current) {
      return;
    }

    let nextLatestSeq = lastSeqRef.current;
    const replacements = new Map<string, ChatMessageUI>();
    const additions: ChatMessageUI[] = [];

    for (const message of incoming) {
      if (!message?.id) {
        continue;
      }
      const seqValue = typeof message.seq === 'number' && Number.isFinite(message.seq)
        ? message.seq
        : null;
      if (seqValue !== null) {
        nextLatestSeq = Math.max(nextLatestSeq, seqValue);
      }
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
          } as ChatMessageUI;
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
      return {
        ...message,
        id: messageId,
        timestamp: new Date(serverTs).getTime()
      } as ChatMessageUI;
    }));
    sendReadUpdate(lastSeqRef.current);
  }, [sendReadUpdate]);

  const handleMessageNew = useCallback((data: Record<string, unknown>) => {
    const conversationIdValue = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    const activeConversationId = conversationIdRef.current;
    if (!conversationIdValue || conversationIdValue !== activeConversationId) {
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

    const practiceIdValue = practiceIdRef.current ?? '';
    const metadata = typeof data.metadata === 'object' && data.metadata !== null && !Array.isArray(data.metadata)
      ? data.metadata as Record<string, unknown>
      : null;
    const attachments = Array.isArray(data.attachments)
      ? (data.attachments as string[]).filter((item) => typeof item === 'string')
      : [];

    const message: ConversationMessage = {
      id: messageId,
      conversation_id: conversationIdValue,
      practice_id: practiceIdValue,
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
  }, [applyServerMessages]);

  const fetchGapMessages = useCallback(async (fromSeq: number, latestSeq: number) => {
    const activeConversationId = conversationIdRef.current;
    const activePracticeId = practiceIdRef.current;
    if (!activeConversationId || !activePracticeId) {
      return;
    }

    let nextSeq: number | null = fromSeq;
    let targetLatest = latestSeq;
    let attempt = 0;

    while (nextSeq !== null && nextSeq <= targetLatest) {
      if (
        isDisposedRef.current ||
        conversationIdRef.current !== activeConversationId ||
        practiceIdRef.current !== activePracticeId
      ) {
        return;
      }
      try {
        const params = new URLSearchParams({
          conversationId: activeConversationId,
          practiceId: activePracticeId,
          from_seq: String(nextSeq),
          limit: String(GAP_FETCH_LIMIT)
        });

        const response = await fetch(`${getChatMessagesEndpoint()}?${params.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
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

        if (
          isDisposedRef.current ||
          conversationIdRef.current !== activeConversationId ||
          practiceIdRef.current !== activePracticeId
        ) {
          return;
        }

        applyServerMessages(data.data.messages ?? []);
        if (typeof data.data.latest_seq === 'number') {
          targetLatest = data.data.latest_seq;
        }
        nextSeq = data.data.next_from_seq ?? null;
        attempt = 0;
      } catch (error) {
        attempt += 1;
        if (attempt >= 3) {
          const message = error instanceof Error ? error.message : 'Failed to recover message gap';
          onError?.(message);
          isClosingSocketRef.current = true;
          wsRef.current?.close();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 400 * attempt));
      }
    }
  }, [applyServerMessages, onError]);

  const scheduleReconnect = useCallback((targetConversationId: string) => {
    if (reconnectTimeoutRef.current || isClosingSocketRef.current) {
      return;
    }
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    const delay = Math.min(1000 * attempt, 5000);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      if (isClosingSocketRef.current || conversationIdRef.current !== targetConversationId) {
        return;
      }
      connectChatRoomRef.current(targetConversationId);
    }, delay);
  }, []);

  const connectChatRoom = useCallback((targetConversationId: string) => {
    if (!sessionReady) {
      return;
    }
    if (!targetConversationId) {
      return;
    }
    if (typeof WebSocket === 'undefined') {
      onError?.('WebSocket is not available in this environment.');
      return;
    }
    if (
      wsRef.current &&
      conversationIdRef.current === targetConversationId &&
      wsRef.current.readyState === WebSocket.OPEN &&
      isSocketReadyRef.current
    ) {
      return;
    }

    clearReconnectTimer();
    isClosingSocketRef.current = false;
    socketSessionRef.current += 1;
    const sessionId = socketSessionRef.current;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    initSocketReadyPromise();

    const ws = new WebSocket(getConversationWsEndpoint(targetConversationId));
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      reconnectAttemptsRef.current = 0;
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
                conversation_id: targetConversationId,
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
          onError?.(message);
          rejectSocketReady(new Error(message));
          isClosingSocketRef.current = true;
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
            fetchGapMessages(fromSeq, latestSeq).catch((error) => {
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
      if (!isClosingSocketRef.current && conversationIdRef.current === targetConversationId) {
        scheduleReconnect(targetConversationId);
      }
    });

    ws.addEventListener('error', (error) => {
      if (import.meta.env.DEV) {
        console.warn('[ChatRoom] WebSocket error', error);
      }
    });
  }, [
    clearReconnectTimer,
    fetchGapMessages,
    flushPendingAcks,
    handleMessageAck,
    handleMessageNew,
    initSocketReadyPromise,
    onError,
    rejectSocketReady,
    resolveSocketReady,
    scheduleReconnect,
    sendFrame,
    sendReadUpdate,
    sessionReady
  ]);

  connectChatRoomRef.current = connectChatRoom;

  const closeChatSocket = useCallback(() => {
    clearReconnectTimer();
    isClosingSocketRef.current = true;
    isSocketReadyRef.current = false;
    rejectSocketReady(new Error('Chat connection closed'));
    flushPendingAcks(new Error('Chat connection closed'));
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearReconnectTimer, flushPendingAcks, rejectSocketReady]);

  const sendMessageOverWs = useCallback(async (
    content: string,
    attachments: FileAttachment[],
    metadata?: Record<string, unknown> | null
  ) => {
    const effectivePracticeId = (practiceIdRef.current ?? '').trim();
    const activeConversationId = conversationIdRef.current;
    if (!effectivePracticeId) {
      throw new Error('Practice ID is required. Please wait a moment and try again.');
    }
    if (!activeConversationId) {
      throw new Error('Conversation ID is required for sending messages.');
    }
    if (!content.trim()) {
      throw new Error('Message cannot be empty.');
    }

    const clientId = createClientId();
    const tempId = `temp-${clientId}`;
    const tempMessage: ChatMessageUI = {
      id: tempId,
      content,
      isUser: true,
      role: 'user',
      timestamp: Date.now(),
      metadata: metadata ?? undefined,
      files: attachments
    };

    setMessages(prev => [...prev, tempMessage]);
    pendingClientMessageRef.current.set(clientId, tempId);

    const ackPromise = new Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }>((resolve, reject) => {
      pendingAckRef.current.set(clientId, { resolve, reject });
    });

    const attachmentIds = attachments.map(att => att.id || att.storageKey || '').filter(Boolean);

    try {
      if (!isSocketReadyRef.current) {
        connectChatRoomRef.current(activeConversationId);
      }
      await waitForSocketReady();
      sendFrame({
        type: 'message.send',
        data: {
          conversation_id: activeConversationId,
          client_id: clientId,
          content,
          ...(attachmentIds.length > 0 ? { attachments: attachmentIds } : {}),
          ...(metadata ? { metadata } : {})
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
  }, [sendFrame, waitForSocketReady]);

  // Main message sending function
  const sendMessage = useCallback(async (message: string, attachments: FileAttachment[] = []) => {
    // Debug hook for test environment (development only)
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_SEND_MESSAGE__) {
      window.__DEBUG_SEND_MESSAGE__(message, attachments);
    }

    const shouldUseAi = mode === 'ASK_QUESTION';
    const hasUserMessages = messages.some((msg) => msg.isUser);
    const trimmedMessage = message.trim();

    try {
      await sendMessageOverWs(message, attachments);

      if (!shouldUseAi || trimmedMessage.length === 0) {
        return;
      }

      const resolvedPracticeSlug = (practiceSlug ?? practiceId ?? '').trim();
      if (!resolvedPracticeSlug) {
        throw new Error('Practice slug is required for AI responses');
      }

      if (!hasLoggedIntentRef.current && !hasUserMessages) {
        intentAbortRef.current?.abort();
        const intentController = new AbortController();
        intentAbortRef.current = intentController;
        const intentConversationId = conversationId;
        const intentPracticeSlug = resolvedPracticeSlug;
        let intentResponse: Response | null = null;
        try {
          intentResponse = await fetch('/api/ai/intent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            signal: intentController.signal,
            body: JSON.stringify({
              conversationId,
              practiceSlug: resolvedPracticeSlug,
              message: trimmedMessage
            })
          });
        } catch (intentError) {
          if (intentError instanceof Error && intentError.name === 'AbortError') {
            intentResponse = null;
          } else {
            throw intentError;
          }
        }

        if (intentResponse?.ok) {
          const intentData = await intentResponse.json() as FirstMessageIntent;
          if (intentController.signal.aborted) {
            return;
          }
          if (conversationIdRef.current !== intentConversationId || resolvedPracticeSlug !== intentPracticeSlug) {
            return;
          }
          if (hasLoggedIntentRef.current) {
            return;
          }
          hasLoggedIntentRef.current = true;
          try {
            await updateConversationMetadata({
              first_message_intent: intentData
            }, intentConversationId);
          } catch (intentError) {
            console.warn('[useMessageHandling] Failed to persist intent classification', intentError);
          }
        } else if (intentResponse) {
          console.warn('[useMessageHandling] Intent classification request failed', {
            status: intentResponse.status
          });
        }
      }

      const aiMessages = [
        ...messages
          .filter((msg) =>
            msg.role === 'user' ||
            msg.role === 'assistant' ||
            (msg.role === 'system' && msg.metadata?.source === 'ai')
          )
          .map((msg) => ({
            role: msg.role === 'system' ? 'assistant' : msg.role,
            content: msg.content
          })),
        { role: 'user' as const, content: trimmedMessage }
      ];

      const aiResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          practiceSlug: resolvedPracticeSlug,
          messages: aiMessages
        })
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json() as { reply?: string; message?: ConversationMessage };
      if (aiData.message) {
        applyServerMessages([aiData.message]);
        return;
      }
      const reply = (aiData.reply ?? '').trim();
      if (!reply) {
        throw new Error('AI response missing');
      }
      if (import.meta.env.DEV) {
        console.warn('[useMessageHandling] AI returned reply without persisted message');
      }
      onError?.('Something went wrong. Please try again.');
    } catch (error) {
      console.error('Error sending message:', {
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      const errorMessage = error instanceof Error && error.message
        ? error.message
        : "Failed to send message. Please try again.";

      onError?.(errorMessage);
    }
  }, [
    applyServerMessages,
    conversationId,
    messages,
    mode,
    practiceId,
    practiceSlug,
    onError,
    sendMessageOverWs,
    updateConversationMetadata
  ]);

  const confirmIntakeLead = useCallback(async (intakeUuid: string) => {
    if (!intakeUuid || !conversationId) return;
    const practiceContextId = (practiceId ?? practiceSlug ?? '').trim();
    if (!practiceContextId) return;

    try {
      const response = await fetch(`${getIntakeConfirmEndpoint()}?practiceId=${encodeURIComponent(practiceContextId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          intakeUuid,
          conversationId
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        const detail = payload?.error ? ` (${payload.error})` : '';
        console.warn(`[Intake] Lead confirmation failed: ${response.status}${detail}`);
      }
    } catch (error) {
      console.warn('[Intake] Lead confirmation failed', error);
    }
  }, [conversationId, practiceId, practiceSlug]);

  // Handle contact form submission
  const handleContactFormSubmit = useCallback(async (contactData: ContactData) => {
    logDev('[useMessageHandling] handleContactFormSubmit called with:', {
      name: !!contactData.name,
      email: !!contactData.email,
      phone: !!contactData.phone,
      location: !!contactData.location,
      opposingParty: !!contactData.opposingParty,
      description: !!contactData.description
    });
    try {
      // Format contact data as a structured message
      const contactMessage = `Contact Information:
Name: ${contactData.name}
Email: ${contactData.email}
Phone: ${contactData.phone}
Location: ${contactData.location}${contactData.opposingParty ? `\nOpposing Party: ${contactData.opposingParty}` : ''}${contactData.description ? `\nDescription: ${contactData.description}` : ''}`;

      // Debug hook for test environment (development only, PII-safe)
      if (import.meta.env.MODE === 'development' && typeof window !== 'undefined' && window.__DEBUG_CONTACT_FORM__) {
        // Create sanitized payload with presence flags instead of raw PII
        const sanitizedContactData = {
          nameProvided: !!contactData.name,
          emailProvided: !!contactData.email,
          phoneProvided: !!contactData.phone,
          locationProvided: !!contactData.location,
          opposingPartyProvided: !!contactData.opposingParty,
          descriptionProvided: !!contactData.description
        };
        
        // Create redacted contact message indicating sections without actual values
        const redactedContactMessage = `Contact Information:
Name: ${contactData.name ? '[PROVIDED]' : '[NOT PROVIDED]'}
Email: ${contactData.email ? '[PROVIDED]' : '[NOT PROVIDED]'}
Phone: ${contactData.phone ? '[PROVIDED]' : '[NOT PROVIDED]'}
Location: ${contactData.location ? '[PROVIDED]' : '[NOT PROVIDED]'}${contactData.opposingParty ? '\nOpposing Party: [PROVIDED]' : ''}${contactData.description ? '\nDescription: [PROVIDED]' : ''}`;
        
        window.__DEBUG_CONTACT_FORM__(sanitizedContactData, redactedContactMessage);
      }

      // Send the contact information as a user message with metadata flag
      // This metadata helps us detect that the contact form was submitted
      if (!conversationId) {
        throw new Error('Conversation ID is required');
      }

      const resolvedPracticeSlug = (practiceSlug ?? practiceId ?? '').trim();
      if (!resolvedPracticeSlug) {
        throw new Error('Practice slug is required to submit intake');
      }

      const intakeResult = await submitContactForm(
        {
          ...contactData,
          sessionId: conversationId
        },
        resolvedPracticeSlug
      );

      await sendMessageOverWs(contactMessage, [], {
        // Mark this as a contact form submission without storing PII in metadata
        isContactFormSubmission: true
      });

      // Show success feedback
      if (import.meta.env.DEV) {
        console.log('[ContactForm] Successfully submitted contact information');
      }

      const paymentDetails = intakeResult.intake;
      const paymentRequired = paymentDetails?.paymentLinkEnabled === true;
      const clientSecret = paymentDetails?.clientSecret;
      const paymentLinkUrl = paymentDetails?.paymentLinkUrl;
      const hasClientSecret = typeof clientSecret === 'string' && clientSecret.trim().length > 0;
      const hasPaymentLink = typeof paymentLinkUrl === 'string' && paymentLinkUrl.trim().length > 0;

      if (paymentRequired && (hasClientSecret || hasPaymentLink)) {
        const paymentMessageId = `system-payment-${paymentDetails.uuid ?? Date.now()}`;
        const paymentMessageExists = messages.some((msg) => msg.id === paymentMessageId);
        if (!paymentMessageExists) {
          const returnTo = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : undefined;
          const practiceContextId = practiceId || resolvedPracticeSlug;
          if (typeof window !== 'undefined' && paymentDetails?.uuid && hasPaymentLink) {
            try {
              const stored = {
                practiceName: paymentDetails.organizationName ?? 'the practice',
                practiceId: practiceContextId,
                conversationId
              };
              window.sessionStorage.setItem(
                `intakePaymentPending:${paymentDetails.uuid}`,
                JSON.stringify(stored)
              );
            } catch {
              // sessionStorage may be unavailable in private browsing.
            }
          }
          const paymentUrl = buildIntakePaymentUrl({
            intakeUuid: paymentDetails.uuid,
            clientSecret: hasClientSecret ? clientSecret : undefined,
            paymentLinkUrl: hasPaymentLink ? paymentLinkUrl : undefined,
            amount: paymentDetails.amount,
            currency: paymentDetails.currency,
            practiceName: paymentDetails.organizationName,
            practiceLogo: paymentDetails.organizationLogo,
            practiceSlug: resolvedPracticeSlug,
            practiceId: practiceContextId,
            conversationId,
            returnTo
          });
          setMessages(prev => {
            if (prev.some((msg) => msg.id === paymentMessageId)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: paymentMessageId,
                role: 'assistant',
                content: 'One more step: submit the consultation fee to complete your intake.',
                timestamp: Date.now(),
                isUser: false,
                paymentRequest: {
                  intakeUuid: paymentDetails.uuid,
                  clientSecret: hasClientSecret ? clientSecret : undefined,
                  paymentLinkUrl: hasPaymentLink ? paymentLinkUrl : undefined,
                  amount: paymentDetails.amount,
                  currency: paymentDetails.currency,
                  practiceName: paymentDetails.organizationName,
                  practiceLogo: paymentDetails.organizationLogo,
                  practiceSlug: resolvedPracticeSlug,
                  practiceId: practiceContextId,
                  conversationId,
                  returnTo
                },
                metadata: {
                  paymentUrl
                }
              }
            ];
          });
        }
      } else if (!paymentRequired && paymentDetails?.uuid) {
        void confirmIntakeLead(paymentDetails.uuid);
      }
    } catch (error) {
      console.error('Error submitting contact form:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit contact information');
      throw error; // Re-throw so form can handle the error state
    }
  }, [conversationId, practiceId, practiceSlug, onError, logDev, messages, confirmIntakeLead, sendMessageOverWs]);

  // Add message to the list
  const addMessage = useCallback((message: ChatMessageUI) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // Update a specific message
  const updateMessage = useCallback((messageId: string, updates: Partial<ChatMessageUI>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } as ChatMessageUI : msg
    ));
  }, []);

  // Clear all messages
  const clearMessages = useCallback(() => {
    resetRealtimeState();
    setMessages([]);
  }, [resetRealtimeState]);

  // Fetch messages from conversation
  const fetchMessages = useCallback(async (
    signal?: AbortSignal,
    targetConversationId?: string
  ) => {
    if (!sessionReady) {
      return;
    }
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) {
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const params = new URLSearchParams({
        conversationId: activeConversationId,
        practiceId,
        limit: '50',
      });

      const response = await fetch(`${getChatMessagesEndpoint()}?${params.toString()}`, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[] } };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

      if (!isDisposedRef.current && activeConversationId === conversationIdRef.current) {
        const uiMessages = data.data.messages.map(toUIMessage);
        messageIdSetRef.current = new Set(data.data.messages.map((msg) => msg.id));
        lastSeqRef.current = data.data.messages.reduce((max, msg) => Math.max(max, msg.seq), 0);
        setMessages(prev => {
          if (uiMessages.length === 0 && prev.length > 0) {
            return prev;
          }
          return uiMessages;
        });
        sendReadUpdate(lastSeqRef.current);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages';
      onError?.(errorMessage);
    }
  }, [conversationId, practiceId, toUIMessage, onError, sendReadUpdate, sessionReady]);

  const startConsultFlow = useCallback((targetConversationId?: string) => {
    if (!sessionReady) {
      return;
    }
    if (!targetConversationId || !practiceId) {
      return;
    }
    consultFlowAbortRef.current?.abort();
    const controller = new AbortController();
    consultFlowAbortRef.current = controller;
    conversationIdRef.current = targetConversationId;
    setIsConsultFlowActive(true);
    fetchMessages(controller.signal, targetConversationId);
    fetchConversationMetadata(controller.signal, targetConversationId).catch((error) => {
      console.warn('[useMessageHandling] Failed to fetch conversation metadata', error);
    });
    connectChatRoom(targetConversationId);
  }, [connectChatRoom, fetchConversationMetadata, fetchMessages, practiceId, sessionReady]);

  // Fetch messages and connect realtime socket when conversation is ready
  useEffect(() => {
    if (!sessionReady) {
      closeChatSocket();
      return;
    }
    if (!conversationId || !practiceId) {
      closeChatSocket();
      return;
    }

    resetRealtimeState();
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    fetchMessages(controller.signal);
    fetchConversationMetadata(controller.signal).catch((error) => {
      console.warn('[useMessageHandling] Failed to fetch conversation metadata', error);
    });
    connectChatRoom(conversationId);

    return () => {
      controller.abort();
      closeChatSocket();
    };
  }, [
    closeChatSocket,
    connectChatRoom,
    conversationId,
    fetchConversationMetadata,
    fetchMessages,
    practiceId,
    resetRealtimeState,
    sessionReady
  ]);

  useEffect(() => {
    intentAbortRef.current?.abort();
  }, [conversationId, practiceId]);

  // Clear UI state when switching to a different conversation to avoid showing stale messages
  useEffect(() => {
    if (
      lastConversationIdRef.current &&
      conversationId &&
      lastConversationIdRef.current !== conversationId
    ) {
      clearMessages();
      setIsConsultFlowActive(false);
      applyConversationMetadata(null);
    }

    lastConversationIdRef.current = conversationId;
  }, [conversationId, applyConversationMetadata, clearMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (intentAbortRef.current) {
        intentAbortRef.current.abort();
      }
      if (consultFlowAbortRef.current) {
        consultFlowAbortRef.current.abort();
      }
      closeChatSocket();
    };
  }, [closeChatSocket]);

  // Determine intake status based on user message count (for anonymous users)
  // 0 messages -> Welcome prompt
  // 1 message -> Show Contact Form
  // After contact form -> Pending review until practice decision
  const { isAnonymous } = useSessionContext();
  const userMessages = messages.filter(m => m.isUser);
  
  // Check if contact form has been submitted by looking for the submission flag
  const hasSubmittedContactForm = messages.some(m => 
    m.isUser && m.metadata?.isContactFormSubmission
  );
  
  const intakeDecision = messages.find(m => {
    const decision = m.metadata?.intakeDecision;
    return decision === 'accepted' || decision === 'rejected';
  })?.metadata?.intakeDecision as 'accepted' | 'rejected' | undefined;

  const intakeStep = useCallback(() => {
    if (!isAnonymous) return 'completed';

    if (intakeDecision === 'accepted') return 'accepted';
    if (intakeDecision === 'rejected') return 'rejected';

    if (!isConsultFlowActive) return 'ready';
    if (hasSubmittedContactForm) return 'pending_review';
    return 'contact_form';
  }, [isAnonymous, intakeDecision, hasSubmittedContactForm, isConsultFlowActive]);

  const currentStep = intakeStep();
  
  // Memoize logging to prevent excessive console output
  useEffect(() => {
    if (messages.length > 0) {
      logDev('[IntakeFlow] Message analysis', {
        totalMessages: messages.length,
        userMessagesCount: userMessages.length,
        hasSubmittedContactForm,
        messagesWithIsUser: messages.map(m => ({ 
          id: m.id, 
          isUser: m.isUser, 
          role: m.role, 
          content: m.content.substring(0, 50),
          hasIsUserProperty: 'isUser' in m,
          isUserType: typeof m.isUser,
          isUserValue: m.isUser,
          hasMetadata: !!m.metadata,
          hasContactFormFlag: !!m.metadata?.isContactFormSubmission,
          metadataKeys: m.metadata ? Object.keys(m.metadata) : []
        }))
      });
    }
  }, [messages, userMessages.length, hasSubmittedContactForm, logDev]);
  
  useEffect(() => {
    logDev('[IntakeFlow] Step calculation', {
      isAnonymous,
      userMessagesCount: userMessages.length,
      hasSubmittedContactForm,
      currentStep,
      messagesCount: messages.length
    });
  }, [isAnonymous, userMessages.length, hasSubmittedContactForm, currentStep, messages.length, logDev]);

  // Inject system messages based on step
  useEffect(() => {
    if (!isAnonymous) return;

    type PaymentFlag = { uuid: string; practiceName: string };
    type PendingPaymentFlag = PaymentFlag & { practiceId?: string; conversationId?: string };

    let cancelled = false;

    const paymentFlags: PaymentFlag[] = [];
    const pendingFlags: PendingPaymentFlag[] = [];

    const parseStoredFlag = (raw: string | null) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as {
          practiceName?: string;
          practiceId?: string;
          conversationId?: string;
        };
        return parsed;
      } catch (error) {
        console.warn('[Intake] Failed to parse payment flag', error);
        return null;
      }
    };

    const applyPaymentConfirmation = (flag: PaymentFlag) => {
      setMessages(prev => {
        if (cancelled) return prev;
        const newMessages = [...prev];
        const baseMaxTimestamp = newMessages.length > 0
          ? Math.max(...newMessages.map(m => m.timestamp))
          : Date.now();
        let tempTimestamp = baseMaxTimestamp;

        const messageId = `system-payment-confirm-${flag.uuid}`;
        const alreadyExists = newMessages.some((m) =>
          m.id === messageId || m.metadata?.intakePaymentUuid === flag.uuid
        );
        if (alreadyExists) {
          return prev;
        }

        void confirmIntakeLead(flag.uuid);
        newMessages.push({
          id: messageId,
          role: 'assistant',
          content: `Payment received. ${flag.practiceName} will review your intake and follow up here shortly.`,
          timestamp: ++tempTimestamp,
          isUser: false,
          metadata: {
            intakePaymentUuid: flag.uuid,
            paymentStatus: 'succeeded'
          }
        });

        return newMessages.sort((a, b) => a.timestamp - b.timestamp);
      });
    };

    if (typeof window !== 'undefined') {
      const paymentKeys: string[] = [];
      const pendingKeys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key && key.startsWith('intakePaymentSuccess:')) {
          paymentKeys.push(key);
        }
        if (key && key.startsWith('intakePaymentPending:')) {
          pendingKeys.push(key);
        }
      }

      paymentKeys.forEach((key) => {
        const uuid = key.split(':')[1] || 'unknown';
        let practiceName = 'the practice';
        const parsed = parseStoredFlag(window.sessionStorage.getItem(key));
        if (parsed?.practiceName && parsed.practiceName.trim().length > 0) {
          practiceName = parsed.practiceName.trim();
        }
        paymentFlags.push({ uuid, practiceName });
        window.sessionStorage.removeItem(key);
      });

      pendingKeys.forEach((key) => {
        const uuid = key.split(':')[1] || 'unknown';
        let practiceName = 'the practice';
        const parsed = parseStoredFlag(window.sessionStorage.getItem(key));
        if (parsed?.practiceName && parsed.practiceName.trim().length > 0) {
          practiceName = parsed.practiceName.trim();
        }
        pendingFlags.push({
          uuid,
          practiceName,
          practiceId: parsed?.practiceId,
          conversationId: parsed?.conversationId
        });
      });
    }

    paymentFlags.forEach(applyPaymentConfirmation);

    const checkPendingPayments = async () => {
      if (pendingFlags.length === 0) return;
      const practiceContextId = (practiceId ?? practiceSlug ?? '').trim();
      for (const pending of pendingFlags) {
        if (cancelled) return;
        if (pending.conversationId && conversationId && pending.conversationId !== conversationId) {
          continue;
        }
        if (pending.practiceId && practiceContextId && pending.practiceId !== practiceContextId) {
          continue;
        }

        try {
          const status = await fetchIntakePaymentStatus(pending.uuid);
          if (!isPaidIntakeStatus(status)) {
            continue;
          }
        } catch (error) {
          console.warn('[Intake] Failed to check payment status for', pending.uuid, error);
          continue;
        }
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(`intakePaymentPending:${pending.uuid}`);
        }
        applyPaymentConfirmation(pending);
      }
    };

    void checkPendingPayments();

    setMessages(prev => {
      // Check for existence of local system messages
      const hasContactForm = prev.some(m => m.id === 'system-contact-form');
      const hasSubmissionConfirm = prev.some(m => m.id === 'system-submission-confirm');

      const newMessages = [...prev];
      let changed = false;

      // Use monotonically increasing timestamps to ensure stable ordering
      const maxTimestamp = newMessages.length > 0
        ? Math.max(...newMessages.map(m => m.timestamp))
        : Date.now();
      let nextTimestamp = maxTimestamp + 1;

      // Helper to add message if missing
      const addMsg = (id: string, content: string, metadata?: Record<string, unknown>) => {
        // Extract contactForm from metadata if present (for proper typing)
        const contactForm = metadata?.contactForm as {
          fields: string[];
          required: string[];
          message?: string;
          initialValues?: {
            name?: string;
            email?: string;
            phone?: string;
            location?: string;
            opposingParty?: string;
          };
        } | undefined;
        
        // Construct a message that strictly matches ChatMessageUI (specifically the assistant variant)
        const msg: ChatMessageUI = {
          id,
          role: 'assistant',
          content,
          timestamp: nextTimestamp++,
          isUser: false,
          metadata,
          files: undefined,
          contactForm // Set contactForm directly (not just in metadata)
        };
        newMessages.push(msg);
        changed = true;
      };

      // Contact form (present the form conversationally after first message)
      // We collect case details in the form itself, so no need for separate "issue" step
      if (isConsultFlowActive && (currentStep === 'contact_form' || currentStep === 'pending_review')) {
        if (!hasContactForm) {
          // Present the contact form with a conversational message
          addMsg('system-contact-form', 'Could you share your contact details? It will help us find the best lawyer for your case.', {
            contactForm: {
              fields: ['name', 'email', 'phone', 'location', 'opposingParty', 'description'],
              required: ['name', 'email'],
              message: undefined // Remove message from form - it's now in the main message text
            }
          });
        }
      }

      // Submission confirmation (after contact form submitted - conversational)
      if (isConsultFlowActive && currentStep === 'pending_review') {
        if (!hasSubmissionConfirm) {
          addMsg('system-submission-confirm', "Thanks! I've sent your intake to the practice. A legal professional will review it and reply here. You'll receive in-app updates as soon as there's a decision.");
        }
      }

      if (changed) {
        // Sort by timestamp - monotonic timestamps ensure stable ordering
        return newMessages.sort((a, b) => a.timestamp - b.timestamp);
      }
      
      return prev;
    });
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    isAnonymous,
    isConsultFlowActive,
    confirmIntakeLead,
    conversationId,
    messages,
    practiceId,
    practiceSlug
  ]);

  // The intake flow is now conversational and non-blocking
  return {
    messages,
    sendMessage,
    handleContactFormSubmit,
    startConsultFlow,
    addMessage,
    updateMessage,
    clearMessages,
    updateConversationMetadata,
    isConsultFlowActive,
    intakeStatus: {
      step: currentStep,
      decision: intakeDecision
    }
  };
};
