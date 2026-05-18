import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface PresenceContextValue {
  /** Set of userIds currently online for the active practice. */
  onlineUserIds: ReadonlySet<string>;
  /** Per-conversation set of userIds currently typing (server-broadcast). */
  typingByConversation: ReadonlyMap<string, ReadonlySet<string>>;
  /** True once the WebSocket has received its first snapshot. */
  isReady: boolean;
}

const EmptyPresenceContext: PresenceContextValue = {
  onlineUserIds: new Set<string>(),
  typingByConversation: new Map<string, ReadonlySet<string>>(),
  isReady: false,
};

const PresenceContext = createContext<PresenceContextValue>(EmptyPresenceContext);

export const usePresenceContext = (): PresenceContextValue => useContext(PresenceContext);

/**
 * Returns true when the given userId has at least one live socket connected
 * to the practice's PresenceRoom.
 */
export const useIsUserOnline = (userId: string | null | undefined): boolean => {
  const { onlineUserIds } = usePresenceContext();
  if (!userId) return false;
  return onlineUserIds.has(userId);
};

/**
 * Returns the set of userIds typing in the given conversation, excluding the
 * supplied selfUserId. Backed by the practice-wide presence WS, so works for
 * conversation list rows that aren't actively subscribed to per-conversation WS.
 */
export const useTypingInConversation = (
  conversationId: string | null | undefined,
  selfUserId: string | null | undefined,
): ReadonlySet<string> => {
  const { typingByConversation } = usePresenceContext();
  if (!conversationId) return EMPTY_TYPING_SET;
  const typers = typingByConversation.get(conversationId);
  if (!typers || typers.size === 0) return EMPTY_TYPING_SET;
  if (!selfUserId || !typers.has(selfUserId)) return typers;
  const next = new Set(typers);
  next.delete(selfUserId);
  return next;
};

const EMPTY_TYPING_SET: ReadonlySet<string> = new Set();
const TYPING_EXPIRY_MS = 6_000;

interface PresenceProviderProps {
  practiceId: string | null | undefined;
  /** Authenticated userId. When null/empty, the provider is dormant
   *  (anonymous users don't track presence). */
  userId: string | null | undefined;
  enabled?: boolean;
  children: ComponentChildren;
}

/**
 * Holds a single WebSocket to /api/presence/:practiceId/ws and
 * exposes the most recent presence snapshot via PresenceContext. Reconnects
 * with exponential backoff if the socket drops.
 */
export const PresenceProvider = ({ practiceId, userId, enabled = true, children }: PresenceProviderProps) => {
  const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(new Set());
  const [typingByConversation, setTypingByConversation] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  // (conversationId, userId) → expiry timer. Cleared on typing.stop or after
  // TYPING_EXPIRY_MS so the indicator never sticks on dropped connections.
  const typingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const applyTypingState = useCallback((conversationId: string, typingUserId: string, isTyping: boolean) => {
    const key = `${conversationId}::${typingUserId}`;
    const timers = typingTimersRef.current;
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
      timers.delete(key);
    }
    setTypingByConversation((prev) => {
      const current = prev.get(conversationId);
      const has = current?.has(typingUserId) ?? false;
      if (isTyping) {
        if (has) return prev;
        const nextSet = new Set(current ?? []);
        nextSet.add(typingUserId);
        const next = new Map(prev);
        next.set(conversationId, nextSet);
        return next;
      }
      if (!has || !current) return prev;
      const nextSet = new Set(current);
      nextSet.delete(typingUserId);
      const next = new Map(prev);
      if (nextSet.size === 0) next.delete(conversationId);
      else next.set(conversationId, nextSet);
      return next;
    });
    if (isTyping) {
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        applyTypingState(conversationId, typingUserId, false);
      }, TYPING_EXPIRY_MS));
    }
  }, []);


  useEffect(() => {
    cancelledRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (!enabled || !practiceId || !userId || typeof WebSocket === 'undefined') {
      return () => undefined;
    }

    const buildUrl = (): string => {
      // Prefer same-origin WS so cookies (better-auth session) flow with the
      // upgrade. window.location.protocol → ws/wss mapping.
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/api/presence/${encodeURIComponent(practiceId)}/ws`;
    };

    const connect = () => {
      if (cancelledRef.current) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(buildUrl());
      } catch (error) {
        scheduleReconnect();
        console.warn('[presence] failed to open socket', error);
        return;
      }
      wsRef.current = socket;

      socket.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0;
      });
      socket.addEventListener('message', (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type?: string;
            online?: unknown;
            conversation_id?: unknown;
            user_id?: unknown;
            is_typing?: unknown;
          };
          if (parsed?.type === 'presence' && Array.isArray(parsed.online)) {
            const next = new Set(parsed.online.filter((id): id is string => typeof id === 'string' && id.length > 0));
            setOnlineUserIds(next);
            setIsReady(true);
            return;
          }
          if (parsed?.type === 'typing'
            && typeof parsed.conversation_id === 'string'
            && typeof parsed.user_id === 'string'
          ) {
            applyTypingState(parsed.conversation_id, parsed.user_id, Boolean(parsed.is_typing));
          }
        } catch {
          // Ignore malformed frames — server should never send them.
        }
      });
      socket.addEventListener('close', () => {
        if (cancelledRef.current) return;
        wsRef.current = null;
        scheduleReconnect();
      });
      socket.addEventListener('error', () => {
        // Treat error as a hint to reconnect; close handler will run too.
      });
    };

    const scheduleReconnect = () => {
      if (cancelledRef.current) return;
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(15_000, 500 * 2 ** Math.min(reconnectAttemptsRef.current, 5));
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    connect();
    const typingTimers = typingTimersRef.current;
    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(1000, 'unmount'); } catch { /* ignore */ }
      }
      for (const timer of typingTimers.values()) clearTimeout(timer);
      typingTimers.clear();
      setOnlineUserIds(new Set());
      setTypingByConversation(new Map());
      setIsReady(false);
    };
  }, [enabled, practiceId, userId, applyTypingState]);

  const value = useMemo<PresenceContextValue>(
    () => ({ onlineUserIds, typingByConversation, isReady }),
    [onlineUserIds, typingByConversation, isReady],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
};
