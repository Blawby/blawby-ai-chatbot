const USER_STORAGE_KEY = 'blawby:lastAnonUserId';
const SESSION_STORAGE_KEY = 'blawby:lastAnonSessionId';
const CONVERSATION_PREFIX = 'blawby:anonParticipant:';
const POST_AUTH_CONVERSATION_KEY = 'blawby:postAuthConversation';
const POST_AUTH_CONVERSATION_TTL_MS = 30_000;

export type PostAuthConversationContext = {
  conversationId: string;
  practiceId?: string | null;
  practiceSlug?: string | null;
  workspace?: 'public' | 'practice' | 'client' | 'widget';
};

type PostAuthConversationEnvelope = {
  context: PostAuthConversationContext;
  expiresAt: number;
};

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

export const rememberPostAuthConversationContext = (context: PostAuthConversationContext | null | undefined): void => {
  if (typeof window === 'undefined') return;
  if (!context?.conversationId) return;
  try {
    const payload: PostAuthConversationEnvelope = {
      context: {
      conversationId: context.conversationId,
      practiceId: context.practiceId ?? null,
      practiceSlug: context.practiceSlug ?? null,
      workspace: context.workspace,
      },
      expiresAt: Date.now() + POST_AUTH_CONVERSATION_TTL_MS,
    };
    const serialized = JSON.stringify(payload);
    window.sessionStorage.setItem(POST_AUTH_CONVERSATION_KEY, serialized);
    window.localStorage.setItem(POST_AUTH_CONVERSATION_KEY, serialized);
  } catch {
    // ignore storage failures
  }
};

const parsePostAuthConversationContext = (raw: string | null): PostAuthConversationContext | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PostAuthConversationContext | PostAuthConversationEnvelope;
    const context = (
      parsed &&
      typeof parsed === 'object' &&
      'context' in parsed &&
      parsed.context &&
      typeof parsed.context === 'object'
    )
      ? (parsed.context as PostAuthConversationContext)
      : (parsed as PostAuthConversationContext);
    if (!context || typeof context !== 'object') return null;
    if (typeof context.conversationId !== 'string' || context.conversationId.trim().length === 0) {
      return null;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'expiresAt' in parsed &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt) &&
      Date.now() > parsed.expiresAt
    ) {
      return null;
    }
    return context;
  } catch {
    return null;
  }
};

export const consumePostAuthConversationContext = (): PostAuthConversationContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(POST_AUTH_CONVERSATION_KEY);
    const fallbackRaw = raw ?? window.localStorage.getItem(POST_AUTH_CONVERSATION_KEY);
    window.sessionStorage.removeItem(POST_AUTH_CONVERSATION_KEY);
    window.localStorage.removeItem(POST_AUTH_CONVERSATION_KEY);
    return parsePostAuthConversationContext(fallbackRaw);
  } catch {
    return null;
  }
};

export const peekPostAuthConversationContext = (): PostAuthConversationContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(POST_AUTH_CONVERSATION_KEY)
      ?? window.localStorage.getItem(POST_AUTH_CONVERSATION_KEY);
    const parsed = parsePostAuthConversationContext(raw);
    if (!parsed) {
      window.sessionStorage.removeItem(POST_AUTH_CONVERSATION_KEY);
      window.localStorage.removeItem(POST_AUTH_CONVERSATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
