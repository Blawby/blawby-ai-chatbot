import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useSessionContext } from '../contexts/SessionContext.js';

const STORAGE_PREFIX = 'session:';

interface SessionResponsePayload {
  sessionId: string;
  sessionToken?: string | null;
  state?: string;
  lastActive?: string;
  expiresAt?: string;
}

export interface ChatSessionState {
  sessionId: string | null;
  sessionToken: string | null;
  isInitializing: boolean;
  error: string | null;
  refreshSession: () => Promise<SessionResponsePayload | void>;
  clearStoredSession: () => void;
}

export function useChatSessionWithContext(): ChatSessionState {
  const { activeOrganizationId } = useSessionContext();
  return useChatSession(activeOrganizationId);
}

/**
 * Legacy hook that requires organizationId parameter
 * @deprecated Use useChatSessionWithContext() instead
 */
export function useChatSession(organizationId?: string | null): ChatSessionState {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isDisposedRef = useRef(false);
  const handshakeOrgRef = useRef<{ orgId: string | null; promise: Promise<SessionResponsePayload | void> } | null>(null);

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
    };
  }, []);

  const getStorageKey = useCallback(() => {
    if (!organizationId) return null;
    
    return `${STORAGE_PREFIX}${organizationId}`;
  }, [organizationId]);

  const readStoredSessionId = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const storageKey = getStorageKey();
    if (!storageKey) return null;
    try {
      return window.localStorage.getItem(storageKey);
    } catch (storageError) {
      console.warn('Failed to read session from storage', storageError);
      return null;
    }
  }, [getStorageKey]);

  const writeStoredSessionId = useCallback((value: string | null) => {
    if (typeof window === 'undefined') return;
    const storageKey = getStorageKey();
    if (!storageKey) return;
    try {
      if (value) {
        window.localStorage.setItem(storageKey, value);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch (storageError) {
      console.warn('Failed to persist session to storage', storageError);
    }
  }, [getStorageKey]);

  const clearStoredSession = useCallback(() => {
    writeStoredSessionId(null);
    if (!isDisposedRef.current) {
      setSessionId(null);
      setSessionToken(null);
    }
  }, [writeStoredSessionId]);

  const performHandshake = useCallback(async (): Promise<SessionResponsePayload | void> => {
    if (!organizationId) {
      return;
    }

    // Prevent multiple simultaneous handshakes for the same organization
    if (handshakeOrgRef.current && handshakeOrgRef.current.orgId === organizationId) {
      return handshakeOrgRef.current.promise;
    }

    // Create the handshake promise and store it with the organization ID
    const handshakePromise = (async (): Promise<SessionResponsePayload | void> => {
      const storedSessionId = readStoredSessionId();
      const body: Record<string, unknown> = { organizationId };
      if (storedSessionId) {
        body.sessionId = storedSessionId;
      }

      if (!isDisposedRef.current) {
        setIsInitializing(true);
      }

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Session initialization failed (${response.status})`);
      }

      const json = await response.json() as { success?: boolean; error?: string; data?: SessionResponsePayload };
      if (!json?.success) {
        throw new Error(json?.error || 'Session initialization failed');
      }

      const data = json.data;
      if (!data || typeof data.sessionId !== 'string' || !data.sessionId) {
        throw new Error('Session ID missing from response');
      }

      writeStoredSessionId(data.sessionId);

      // Only update state if this handshake is still for the current organization
      if (!isDisposedRef.current && handshakeOrgRef.current?.orgId === organizationId) {
        setSessionId(data.sessionId);
        setSessionToken(typeof data.sessionToken === 'string' ? data.sessionToken : null);
        setError(null);
      }

      return data;
    } catch (handshakeError) {
      const message = handshakeError instanceof Error
        ? handshakeError.message
        : 'Unknown session error';
      // Only update error state if this handshake is still for the current organization
      if (!isDisposedRef.current && handshakeOrgRef.current?.orgId === organizationId) {
        setError(message);
      }
      console.warn('Session handshake failed:', handshakeError);
      throw handshakeError;
    } finally {
      // Only clear handshake state if this handshake is still for the current organization
      if (handshakeOrgRef.current?.orgId === organizationId) {
        handshakeOrgRef.current = null;
        // Only clear isInitializing if this handshake is still the active one
        if (!isDisposedRef.current) {
          setIsInitializing(false);
        }
      }
    }
    })();

    // Store the promise with the organization ID
    handshakeOrgRef.current = { orgId: organizationId, promise: handshakePromise };
    
    return handshakePromise;
  }, [organizationId, readStoredSessionId, writeStoredSessionId]);

  useEffect(() => {
    if (!organizationId) {
      clearStoredSession();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await performHandshake();
      } catch {
        if (cancelled) return;
        // Error state already handled inside performHandshake
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, clearStoredSession, performHandshake]); // Only re-run when organizationId actually changes

  return {
    sessionId,
    sessionToken,
    isInitializing,
    error,
    refreshSession: performHandshake,
    clearStoredSession
  };
}
