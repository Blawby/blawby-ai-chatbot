import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { invalidateParticipants } from '@/shared/lib/conversationRepository';
import { getConversationWsEndpoint } from '@/config/api';
import { appendWidgetTokenToUrl } from '@/shared/utils/widgetAuth';
import { quickActionDebugLog } from '@/shared/utils/quickActionDebug';

type MutableRefObject<T> = { current: T };

const CHAT_PROTOCOL_VERSION = 1;
const SOCKET_READY_TIMEOUT_MS = 8_000;
const RECONNECT_BASE_DELAY_MS = 800;
const RECONNECT_MAX_DELAY_MS = 12_000;
const RECONNECT_MAX_ATTEMPTS = 5;

type PendingAckMap = MutableRefObject<Map<string, {
  resolve: (ack: { messageId: string; seq: number; serverTs: string; clientId: string }) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>>;

export interface UseConversationTransportOptions {
  enabled: boolean;
  sessionReady: boolean;
  practiceId: string | undefined;
  onError?: (error: unknown) => void;
  onMessageNew: (data: Record<string, unknown>) => void;
  onMessageAck: (data: Record<string, unknown>) => void;
  onReactionUpdate: (data: Record<string, unknown>) => void;
  onGap: (fromSeq: number, latestSeq: number) => void;
  onResumeOk: (latestSeq: number) => void;
  lastSeqRef: MutableRefObject<number>;
  lastReadSeqRef: MutableRefObject<number>;
  pendingAckRef: PendingAckMap;
}

export interface UseConversationTransportResult {
  isSocketReady: boolean;
  sendFrame: (frame: { type: string; data: Record<string, unknown>; request_id?: string }) => void;
  waitForSocketReady: () => Promise<void>;
  connectChatRoom: (targetConversationId: string) => void;
  closeChatSocket: () => void;
  isSocketReadyRef: MutableRefObject<boolean>;
  socketConversationIdRef: MutableRefObject<string | null>;
  wsReadyRef: MutableRefObject<Promise<void> | null>;
}

export const useConversationTransport = ({
  enabled,
  sessionReady,
  practiceId,
  onError,
  onMessageNew,
  onMessageAck,
  onReactionUpdate,
  onGap,
  onResumeOk,
  lastSeqRef,
  lastReadSeqRef,
  pendingAckRef,
}: UseConversationTransportOptions): UseConversationTransportResult => {
  const [isSocketReady, setIsSocketReady] = useState(false);
  const isDisposedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef<Promise<void> | null>(null);
  const wsReadyResolveRef = useRef<(() => void) | null>(null);
  const wsReadyRejectRef = useRef<((error: Error) => void) | null>(null);
  const socketSessionRef = useRef(0);
  const isSocketReadyRef = useRef(false);
  const isClosingSocketRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectChatRoomRef = useRef<(id: string) => void>(() => {});
  const resumeSeqResetAttemptedForRef = useRef<string | null>(null);
  const socketConversationIdRef = useRef<string | null>(null);
  const onMessageNewRef = useRef(onMessageNew);
  const onMessageAckRef = useRef(onMessageAck);
  const onReactionUpdateRef = useRef(onReactionUpdate);
  const onGapRef = useRef(onGap);
  const onResumeOkRef = useRef(onResumeOk);
  const onErrorRef = useRef(onError);
  const sessionReadyRef = useRef(sessionReady);
  const practiceIdRef = useRef(practiceId);

  onMessageNewRef.current = onMessageNew;
  onMessageAckRef.current = onMessageAck;
  onReactionUpdateRef.current = onReactionUpdate;
  onGapRef.current = onGap;
  onResumeOkRef.current = onResumeOk;
  onErrorRef.current = onError;

  useEffect(() => {
    sessionReadyRef.current = sessionReady;
  }, [sessionReady]);

  useEffect(() => {
    practiceIdRef.current = practiceId;
  }, [practiceId]);

  const updateSocketReady = useCallback((ready: boolean) => {
    if (isDisposedRef.current) return;
    setIsSocketReady(ready);
  }, []);

  const initSocketReadyPromise = useCallback(() => {
    const nextReadyPromise = new Promise<void>((resolve, reject) => {
      wsReadyResolveRef.current = resolve;
      wsReadyRejectRef.current = reject;
    });
    nextReadyPromise.catch(() => {});
    wsReadyRef.current = nextReadyPromise;
    isSocketReadyRef.current = false;
    updateSocketReady(false);
  }, [updateSocketReady]);

  const resolveSocketReady = useCallback(() => {
    isSocketReadyRef.current = true;
    updateSocketReady(true);
    wsReadyResolveRef.current?.();
    wsReadyResolveRef.current = null;
    wsReadyRejectRef.current = null;
  }, [updateSocketReady]);

  const rejectSocketReady = useCallback((error: Error) => {
    isSocketReadyRef.current = false;
    updateSocketReady(false);
    wsReadyRejectRef.current?.(error);
    wsReadyResolveRef.current = null;
    wsReadyRejectRef.current = null;
  }, [updateSocketReady]);

  const flushPendingAcks = useCallback((error: Error) => {
    for (const pending of pendingAckRef.current.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingAckRef.current.clear();
  }, [pendingAckRef]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const waitForSocketReady = useCallback(async () => {
    if (!wsReadyRef.current) throw new Error('Chat connection not initialized');
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<void>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Chat connection timed out')), SOCKET_READY_TIMEOUT_MS);
    });
    try {
      await Promise.race([wsReadyRef.current, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, []);

  const sendFrame = useCallback((frame: { type: string; data: Record<string, unknown>; request_id?: string }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('Chat connection not open');
    ws.send(JSON.stringify(frame));
  }, []);

  const scheduleReconnect = useCallback((targetConversationId: string) => {
    if (isDisposedRef.current || isClosingSocketRef.current || !sessionReadyRef.current) return;
    if (socketConversationIdRef.current !== targetConversationId || reconnectTimerRef.current) return;
    const nextAttempt = reconnectAttemptRef.current + 1;
    if (nextAttempt > RECONNECT_MAX_ATTEMPTS) return;
    reconnectAttemptRef.current = nextAttempt;
    const backoff = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (nextAttempt - 1), RECONNECT_MAX_DELAY_MS);
    reconnectTimerRef.current = globalThis.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (isDisposedRef.current || isClosingSocketRef.current) return;
      if (!sessionReadyRef.current || socketConversationIdRef.current !== targetConversationId) return;
      connectChatRoomRef.current(targetConversationId);
    }, backoff + Math.floor(Math.random() * 250));
  }, []);

  const connectChatRoom = useCallback((targetConversationId: string) => {
    if (!enabled || !sessionReady || !targetConversationId) return;
    clearReconnectTimer();
    if (typeof WebSocket === 'undefined') {
      onErrorRef.current?.('WebSocket is not available in this environment.');
      return;
    }
    if (wsRef.current && socketConversationIdRef.current === targetConversationId) {
      if (wsRef.current.readyState === WebSocket.CONNECTING) return;
      if (wsRef.current.readyState === WebSocket.OPEN && isSocketReadyRef.current) return;
    }

    isClosingSocketRef.current = false;
    socketSessionRef.current += 1;
    const sessionId = socketSessionRef.current;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    socketConversationIdRef.current = targetConversationId;
    initSocketReadyPromise();

    const wsUrl = appendWidgetTokenToUrl(getConversationWsEndpoint(targetConversationId));
    if (import.meta.env.DEV) {
      console.log('[WebSocket] Creating connection to', wsUrl);
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      if (import.meta.env.DEV) {
        console.log('[WebSocket] Connection opened');
      }
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      ws.send(JSON.stringify({ type: 'auth', data: { protocol_version: CHAT_PROTOCOL_VERSION, client_info: { platform: 'web' } } }));
    });

    ws.addEventListener('message', (event) => {
      if (socketSessionRef.current !== sessionId || typeof event.data !== 'string') return;
      let frame: { type?: string; data?: Record<string, unknown>; request_id?: string };
      try {
        frame = JSON.parse(event.data) as typeof frame;
      } catch {
        return;
      }
      if (!frame.type || !frame.data || typeof frame.data !== 'object') return;

      switch (frame.type) {
        case 'auth.ok':
          resolveSocketReady();
          try {
            sendFrame({ type: 'resume', data: { conversation_id: targetConversationId, last_seq: lastSeqRef.current } });
          } catch (err) {
            if (import.meta.env.DEV) console.warn('[useConversationTransport] Failed to send resume', err);
          }
          return;
        case 'auth.error': {
          const msg = typeof frame.data.message === 'string' ? frame.data.message : 'Chat protocol error';
          onErrorRef.current?.(msg);
          rejectSocketReady(new Error(msg));
          isClosingSocketRef.current = true;
          ws.close();
          return;
        }
        case 'resume.ok': {
          const seq = Number(frame.data.latest_seq);
          if (Number.isFinite(seq)) {
            onResumeOkRef.current(seq);
          }
          return;
        }
        case 'resume.gap': {
          const fromSeq = Number(frame.data.from_seq);
          const latestSeq = Number(frame.data.latest_seq);
          if (Number.isFinite(fromSeq) && Number.isFinite(latestSeq)) {
            onGapRef.current(fromSeq, latestSeq);
          }
          return;
        }
        case 'message.new':
          onMessageNewRef.current(frame.data);
          return;
        case 'message.ack':
          onMessageAckRef.current(frame.data);
          return;
        case 'reaction.update':
          onReactionUpdateRef.current(frame.data);
          return;
        case 'membership.changed':
          if (practiceIdRef.current) {
            invalidateParticipants(practiceIdRef.current, targetConversationId);
          }
          return;
        case 'error': {
          const code = typeof frame.data.code === 'string' ? frame.data.code : null;
          const msg = typeof frame.data.message === 'string' ? frame.data.message : 'Chat error';
          const reqId = typeof frame.request_id === 'string' ? frame.request_id : null;
          if (reqId) {
            const pending = pendingAckRef.current.get(reqId);
            if (pending) {
              clearTimeout(pending.timer);
              pending.reject(new Error(msg));
              pendingAckRef.current.delete(reqId);
              return;
            }
          }

          if (
            code === 'invalid_payload' &&
            msg === 'last_seq ahead of latest' &&
            socketConversationIdRef.current === targetConversationId
          ) {
            if (resumeSeqResetAttemptedForRef.current !== targetConversationId) {
              resumeSeqResetAttemptedForRef.current = targetConversationId;
              lastSeqRef.current = 0;
              lastReadSeqRef.current = 0;
              if (import.meta.env.DEV) {
                quickActionDebugLog('useConversationTransport resume sequence reset', {
                  conversationId: targetConversationId,
                });
              }
              ws.close(4000, 'resume_seq_reset');
              return;
            }
          }

          onErrorRef.current?.(msg);
          return;
        }
        default:
          return;
      }
    });

    ws.addEventListener('close', () => {
      if (import.meta.env.DEV) {
        console.log('[WebSocket] Connection closed');
      }
      if (socketSessionRef.current !== sessionId) return;
      const closedConversationId = socketConversationIdRef.current;
      isSocketReadyRef.current = false;
      rejectSocketReady(new Error('Chat connection closed'));
      flushPendingAcks(new Error('Chat connection closed'));
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (!isClosingSocketRef.current && closedConversationId === targetConversationId) {
        scheduleReconnect(targetConversationId);
      }
    });

    ws.addEventListener('error', (err) => {
      if (import.meta.env.DEV) console.warn('[useConversationTransport] WebSocket error', err);
    });
  }, [
    clearReconnectTimer,
    enabled,
    flushPendingAcks,
    initSocketReadyPromise,
    lastReadSeqRef,
    lastSeqRef,
    pendingAckRef,
    rejectSocketReady,
    resolveSocketReady,
    scheduleReconnect,
    sendFrame,
    sessionReady,
  ]);

  connectChatRoomRef.current = connectChatRoom;

  const closeChatSocket = useCallback(() => {
    isClosingSocketRef.current = true;
    isSocketReadyRef.current = false;
    rejectSocketReady(new Error('Chat connection closed'));
    flushPendingAcks(new Error('Chat connection closed'));
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    socketConversationIdRef.current = null;
  }, [clearReconnectTimer, flushPendingAcks, rejectSocketReady]);

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      closeChatSocket();
    };
  }, [closeChatSocket]);

  return {
    isSocketReady,
    sendFrame,
    waitForSocketReady,
    connectChatRoom,
    closeChatSocket,
    isSocketReadyRef,
    socketConversationIdRef,
    wsReadyRef,
  };
};
