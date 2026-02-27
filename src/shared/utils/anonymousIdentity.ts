const USER_STORAGE_KEY = 'blawby:lastAnonUserId';
const SESSION_STORAGE_KEY = 'blawby:lastAnonSessionId';
const CONVERSATION_PREFIX = 'blawby:anonParticipant:';

const getConversationKey = (conversationId: string): string => `${CONVERSATION_PREFIX}${conversationId}`;

export const rememberAnonymousUserId = (userId: string | null | undefined): void => {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  try {
    window.sessionStorage.setItem(USER_STORAGE_KEY, userId);
  } catch {
    // sessionStorage may be unavailable (private mode, iframe restrictions, etc.)
  }
};

export const rememberAnonymousSessionId = (sessionId: string | null | undefined): void => {
  if (typeof window === 'undefined') return;
  if (!sessionId) return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage failures
  }
};

export const consumeAnonymousUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(USER_STORAGE_KEY);
    if (value) {
      window.sessionStorage.removeItem(USER_STORAGE_KEY);
    }
    return value;
  } catch {
    return null;
  }
};

export const peekAnonymousUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(USER_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const peekAnonymousSessionId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const clearAnonymousSessionId = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const rememberConversationAnonymousParticipant = (conversationId: string | null | undefined, userId: string | null | undefined): void => {
  if (typeof window === 'undefined') return;
  if (!conversationId || !userId) return;
  try {
    window.sessionStorage.setItem(getConversationKey(conversationId), userId);
  } catch {
    // ignore
  }
};

export const peekConversationAnonymousParticipant = (conversationId: string | null | undefined): string | null => {
  if (typeof window === 'undefined') return null;
  if (!conversationId) return null;
  try {
    return window.sessionStorage.getItem(getConversationKey(conversationId));
  } catch {
    return null;
  }
};

export const clearConversationAnonymousParticipant = (conversationId: string | null | undefined): void => {
  if (typeof window === 'undefined') return;
  if (!conversationId) return;
  try {
    window.sessionStorage.removeItem(getConversationKey(conversationId));
  } catch {
    // ignore
  }
};
