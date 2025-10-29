import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

const STORAGE_PREFIX = 'blawby_session:';

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

/**
 * Hook that uses blawby-ai organization for all chat sessions
 * This is the preferred way to use chat sessions in components
 */
export function useChatSessionWithContext(): ChatSessionState {
  return useChatSession('blawby-ai');
}

/**
 * Legacy hook that requires organizationId parameter
 * @deprecated Use useChatSessionWithContext() instead
 */
export function useChatSession(organizationId: string): ChatSessionState {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isDisposedRef = useRef(false);
  const handshakeOrgRef = useRef<{ orgId: string; promise: Promise<SessionResponsePayload | void> } | null>(null);

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
    };
  }, []);

  const getStorageKey = useCallback(() => {
    if (!organizationId) return null;
    
    const newKey = `${STORAGE_PREFIX}${organizationId}`;
    const migrationFlag = `${STORAGE_PREFIX}_migrated_to_blawby_ai`;
    
    // One-time migration from personal org sessions to blawby-ai
    if (typeof window !== 'undefined') {
      try {
        // Check if migration has already been attempted
        const migrationAttempted = window.localStorage.getItem(migrationFlag);
        if (!migrationAttempted) {
          // Look for any existing personal organization sessions and migrate them to blawby-ai
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(STORAGE_PREFIX) && key !== newKey && key !== migrationFlag) {
              // Check if this is a personal organization session (not blawby-ai)
              const orgId = key.replace(STORAGE_PREFIX, '');
              if (orgId !== 'blawby-ai') {
                const oldValue = window.localStorage.getItem(key);
                if (oldValue) {
                  // Migrate the session to blawby-ai
                  window.localStorage.setItem(newKey, oldValue);
                  // Remove the old personal org session
                  window.localStorage.removeItem(key);
                  console.log(`Migrated chat session from ${key} to ${newKey}`);
                  break; // Only migrate one session
                }
              }
            }
          }
          
          // Set migration flag to prevent repeated migrations
          window.localStorage.setItem(migrationFlag, 'true');
        }
      } catch (error) {
        console.warn('Failed to migrate chat session storage:', error);
        // Set flag even on error to avoid repeated failed attempts
        try {
          window.localStorage.setItem(migrationFlag, 'true');
        } catch (flagError) {
          console.warn('Failed to set migration flag:', flagError);
        }
      }
    }
    
    return newKey;
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
