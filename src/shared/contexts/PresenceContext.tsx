import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface PresenceContextValue {
  /** Set of userIds currently online for the active practice. */
  onlineUserIds: ReadonlySet<string>;
  /** True once the WebSocket has received its first snapshot. */
  isReady: boolean;
}

const EmptyPresenceContext: PresenceContextValue = {
  onlineUserIds: new Set<string>(),
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

interface PresenceProviderProps {
  practiceId: string | null | undefined;
  /** Authenticated userId. When null/empty, the provider is dormant
   *  (anonymous users don't track presence). */
  userId: string | null | undefined;
  enabled?: boolean;
  children: ComponentChildren;
}

/**
 * Holds a single WebSocket to /api/practice/presence/:practiceId/ws and
 * exposes the most recent presence snapshot via PresenceContext. Reconnects
 * with exponential backoff if the socket drops.
 */
export const PresenceProvider = ({ practiceId, userId, enabled = true, children }: PresenceProviderProps): JSX.Element => {
  const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(new Set());
  const [isReady, setIsReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
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
          const parsed = JSON.parse(event.data) as { type?: string; online?: unknown };
          if (parsed?.type === 'presence' && Array.isArray(parsed.online)) {
            const next = new Set(parsed.online.filter((id): id is string => typeof id === 'string' && id.length > 0));
            setOnlineUserIds(next);
            setIsReady(true);
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
    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(1000, 'unmount'); } catch { /* ignore */ }
      }
      setOnlineUserIds(new Set());
      setIsReady(false);
    };
  }, [enabled, practiceId, userId]);

  const value = useMemo<PresenceContextValue>(() => ({ onlineUserIds, isReady }), [onlineUserIds, isReady]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
};
