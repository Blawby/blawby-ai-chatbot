import { useState, useCallback, useRef, useEffect, useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { ChatMessageUI, FileAttachment, MessageReaction } from '../../../worker/types';
import type { ContactData } from '@/features/intake/components/ContactForm';
import { getConversationMessagesEndpoint, getConversationWsEndpoint, getPracticeClientIntakeStatusEndpoint } from '@/config/api';
import { getWorkerApiUrl } from '@/config/urls';
import { submitContactForm } from '@/shared/utils/forms';
import axios from 'axios';
import { linkConversationToUser } from '@/shared/lib/apiClient';
import { buildIntakePaymentUrl, isPaidIntakeStatus, type IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { asMinor } from '@/shared/utils/money';
import type { Conversation, ConversationMessage, ConversationMetadata, ConversationMode, FirstMessageIntent } from '@/shared/types/conversation';
import {
  initialIntakeState,
  type IntakeConversationState,
  type SlimContactDraft,
  type IntakeStep
} from '@/shared/types/intake';
import {
  updateConversationMetadata as patchConversationMetadata,
  fetchMessageReactions,
  addMessageReaction,
  removeMessageReaction,
  postSystemMessage
} from '@/shared/lib/conversationApi';

const DEBUG_MESSAGE_PAGINATION = import.meta.env.DEV;

const sanitizeMarkdown = (text: string): string => {
  if (typeof text !== 'string') return '';
  const sanitizedHtml = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  return sanitizedHtml.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
};

const ABSOLUTE_URL_PATTERN = /^(https?:)?\/\//i;

const buildFileUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (ABSOLUTE_URL_PATTERN.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  return `${getWorkerApiUrl()}/api/files/${encodeURIComponent(trimmed)}`;
};

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
  conversationId?: string;
  linkAnonymousConversationOnLoad?: boolean;
  mode?: ConversationMode | null;
  onConversationMetadataUpdated?: (metadata: ConversationMetadata | null) => void;
  onError?: (error: any, context?: Record<string, unknown>) => void;
}

const CHAT_PROTOCOL_VERSION = 1;
const SOCKET_READY_TIMEOUT_MS = 8000;
const SESSION_READY_TIMEOUT_MS = 8000;
const GAP_FETCH_LIMIT = 50;
const MAX_GAP_FETCH_ATTEMPTS = 3;
const GAP_FETCH_RETRY_DELAY_MS = 1000;
const MESSAGE_CACHE_LIMIT = 200;
const RECONNECT_BASE_DELAY_MS = 800;
const RECONNECT_MAX_DELAY_MS = 12000;
const RECONNECT_MAX_ATTEMPTS = 5;

// Prefix for the temporary streaming bubble ID.
// Must not collide with real message IDs (UUIDs) or other temp IDs.
const STREAMING_BUBBLE_PREFIX = 'streaming-';

type IntakeFieldsPayload = {
  practiceArea?: string;
  practiceAreaName?: string;
  description?: string;
  urgency?: 'routine' | 'time_sensitive' | 'emergency';
  opposingParty?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  addressLine1?: string;
  addressLine2?: string;
  desiredOutcome?: string;
  courtDate?: string;
  income?: string;
  householdSize?: number;
  hasDocuments?: boolean;
  eligibilitySignals?: string[];
  caseStrength?: 'needs_more_info' | 'developing' | 'strong';
  missingSummary?: string | null;
};

const normalizeSlimContactDraft = (value: unknown): SlimContactDraft | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  const email = typeof draft.email === 'string' ? draft.email.trim() : '';
  const phone = typeof draft.phone === 'string' ? draft.phone.trim() : '';
  const city = typeof draft.city === 'string' ? draft.city.trim() : '';
  const state = typeof draft.state === 'string' ? draft.state.trim() : '';
  if (!name || !email || !phone || !city || !state) return null;
  const opposingParty = typeof draft.opposingParty === 'string' ? draft.opposingParty.trim() : '';
  const description = typeof draft.description === 'string' ? draft.description.trim() : '';
  return {
    name,
    email,
    phone,
    city,
    state,
    ...(opposingParty ? { opposingParty } : {}),
    ...(description ? { description } : {})
  };
};

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isTempMessageId = (messageId: string): boolean =>
  messageId.startsWith('temp-') ||
  messageId.startsWith('system-') ||
  messageId.startsWith(STREAMING_BUBBLE_PREFIX);

const getMessageCacheKey = (practiceId: string, conversationId: string): string => (
  `chat:messages:${practiceId}:${conversationId}`
);

const parsePaymentRequestMetadata = (metadata: unknown): IntakePaymentRequest | undefined => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const record = metadata as Record<string, unknown>;
  const candidate = record.paymentRequest;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }
  const data = candidate as Record<string, unknown>;
  const request: IntakePaymentRequest = {};
  if (typeof data.intakeUuid === 'string') request.intakeUuid = data.intakeUuid;
  if (typeof data.clientSecret === 'string') request.clientSecret = data.clientSecret;
  if (typeof data.paymentLinkUrl === 'string') request.paymentLinkUrl = data.paymentLinkUrl;
  if (typeof data.checkoutSessionUrl === 'string') request.checkoutSessionUrl = data.checkoutSessionUrl;
  if (typeof data.checkoutSessionId === 'string') request.checkoutSessionId = data.checkoutSessionId;
  if (typeof data.amount === 'number') request.amount = asMinor(data.amount);
  if (typeof data.currency === 'string') request.currency = data.currency;
  if (typeof data.practiceName === 'string') request.practiceName = data.practiceName;
  if (typeof data.practiceLogo === 'string') request.practiceLogo = data.practiceLogo;
  if (typeof data.practiceSlug === 'string') request.practiceSlug = data.practiceSlug;
  if (typeof data.practiceId === 'string') request.practiceId = data.practiceId;
  if (typeof data.conversationId === 'string') request.conversationId = data.conversationId;
  if (typeof data.returnTo === 'string') request.returnTo = data.returnTo;

  const hasPayload =
    typeof request.intakeUuid === 'string' ||
    typeof request.clientSecret === 'string' ||
    typeof request.paymentLinkUrl === 'string' ||
    typeof request.checkoutSessionUrl === 'string';
  return hasPayload ? request : undefined;
};

const fetchIntakePaidStatus = async (intakeUuid: string, signal?: AbortSignal): Promise<boolean> => {
  const response = await fetch(getPracticeClientIntakeStatusEndpoint(intakeUuid), {
    credentials: 'include',
    signal
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch intake status (${response.status})`);
  }
  const payload = await response.json() as {
    success?: boolean;
    data?: { status?: string; succeeded_at?: string | null };
  };
  if (!payload?.success || !payload.data) return false;
  return isPaidIntakeStatus(payload.data.status, payload.data.succeeded_at);
};

export const useMessageHandlingWithContext = ({ conversationId, onError }: Omit<UseMessageHandlingOptions, 'practiceId'>) => {
  const { activePracticeId } = useSessionContext();
  return useMessageHandling({ practiceId: activePracticeId ?? undefined, conversationId, onError });
};

export const useMessageHandling = ({
  practiceId,
  practiceSlug,
  conversationId,
  linkAnonymousConversationOnLoad = false,
  mode,
  onConversationMetadataUpdated,
  onError
}: UseMessageHandlingOptions) => {
  useEffect(() => {
    if (DEBUG_MESSAGE_PAGINATION) {
      console.info('[useMessageHandling][pagination] instrumentation active');
    }
  }, []);

  const { session, isPending: sessionIsPending, isAnonymous } = useSessionContext();
  const sessionReady = Boolean(session?.user) && !sessionIsPending;
  const currentUserId = session?.user?.id ?? null;
  const [isConversationLinkReady, setIsConversationLinkReady] = useState(!linkAnonymousConversationOnLoad);
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [verifiedPaidIntakeUuids, setVerifiedPaidIntakeUuids] = useState<string[]>([]);
  const [conversationMetadata, setConversationMetadata] = useState<ConversationMetadata | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [messagesReady, setMessagesReady] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const abortControllerRef = useRef<globalThis.AbortController | null>(null);
  const consultFlowAbortRef = useRef<globalThis.AbortController | null>(null);
  const intentAbortRef = useRef<globalThis.AbortController | null>(null);
  const metadataUpdateQueueRef = useRef<Promise<Conversation | null>>(Promise.resolve(null));
  const isDisposedRef = useRef(false);
  const lastConversationIdRef = useRef<string | undefined>();
  const lastConversationLinkAttemptRef = useRef<string | null>(null);

  // Tracks the real message ID we expect from the WebSocket after streaming.
  // When message.new arrives with this ID we remove the streaming bubble.
  const pendingStreamMessageIdRef = useRef<string | null>(null);
  const orphanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId || !practiceId) {
      setIsConversationLinkReady(true);
      return;
    }
    if (!linkAnonymousConversationOnLoad || !sessionReady || isAnonymous || !currentUserId) {
      setIsConversationLinkReady(true);
      return;
    }

    const attemptKey = `${practiceId}:${conversationId}:${currentUserId}`;
    if (lastConversationLinkAttemptRef.current === attemptKey) {
      setIsConversationLinkReady(true);
      return;
    }
    lastConversationLinkAttemptRef.current = attemptKey;

    let cancelled = false;
    setIsConversationLinkReady(false);

    (async () => {
      try {
        await linkConversationToUser(conversationId, practiceId, currentUserId);
      } catch (error) {
        console.warn('[useMessageHandling] Conversation relink on load failed', {
          conversationId,
          practiceId,
          error
        });
        const is409Conflict = axios.isAxiosError(error) && error.response?.status === 409;
        if (is409Conflict) {
          if (!cancelled) setIsConversationLinkReady(true);
          return;
        }
        onError?.(error instanceof Error ? error.message : 'Failed to link conversation');
      } finally {
        if (!cancelled) setIsConversationLinkReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [
    conversationId,
    currentUserId,
    isAnonymous,
    linkAnonymousConversationOnLoad,
    practiceId,
    sessionReady,
    onError
  ]);

  const conversationIdRef = useRef<string | undefined>();
  const practiceIdRef = useRef<string | undefined>();
  const conversationMetadataRef = useRef<ConversationMetadata | null>(null);
  const hasLoggedIntentRef = useRef(false);
  const [isConsultFlowActive, setIsConsultFlowActive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef<Promise<void> | null>(null);
  const wsReadyResolveRef = useRef<(() => void) | null>(null);
  const wsReadyRejectRef = useRef<((error: Error) => void) | null>(null);
  const socketSessionRef = useRef(0);
  const isSocketReadyRef = useRef(false);
  const lastSeqRef = useRef(0);
  const lastReadSeqRef = useRef(0);
  const messageIdSetRef = useRef(new Set<string>());
  const reactionFetchRef = useRef(new Map<string, Promise<MessageReaction[]>>());
  const reactionLoadedRef = useRef(new Set<string>());
  const pendingAckRef = useRef(new Map<string, {
    resolve: (ack: { messageId: string; seq: number; serverTs: string; clientId: string }) => void;
    reject: (error: Error) => void;
  }>());
  const pendingClientMessageRef = useRef(new Map<string, string>());
  const socketConversationIdRef = useRef<string | null>(null);
  const connectChatRoomRef = useRef<(conversationId: string) => void>(() => {});
  const isClosingSocketRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [paymentRetryNotice, setPaymentRetryNotice] = useState<{
    message: string;
    paymentUrl: string;
  } | null>(null);

  practiceIdRef.current = practiceId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const sessionReadyRef = useRef(sessionReady);
  sessionReadyRef.current = sessionReady;

  useEffect(() => {
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
      window.__DEBUG_AI_MESSAGES__ = (messages: ChatMessageUI[]) => {
        console.log('[TEST] Current messages:', messages.map((m) => ({ role: m.role, isUser: m.isUser, id: m.id })));
      };
      window.__DEBUG_AI_MESSAGES__?.(messages);
    }
  }, [messages]);

  useEffect(() => {
    if (mode === 'REQUEST_CONSULTATION') {
      setIsConsultFlowActive(true);
      return;
    }
    if (mode === 'ASK_QUESTION' || mode === null) {
      setIsConsultFlowActive(false);
    }
  }, [mode]);

  const logDev = useCallback((message: string, data?: unknown) => {
    if (import.meta.env.DEV) {
      console.log(message, data);
    }
  }, []);

  const updateSocketReady = useCallback((ready: boolean) => {
    if (isDisposedRef.current) return;
    setIsSocketReady(ready);
  }, []);

  const initSocketReadyPromise = useCallback(() => {
    wsReadyRef.current = new Promise((resolve, reject) => {
      wsReadyResolveRef.current = resolve;
      wsReadyRejectRef.current = reject;
    });
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
      pending.reject(error);
    }
    pendingAckRef.current.clear();
  }, []);

  const resetRealtimeState = useCallback(() => {
    messageIdSetRef.current.clear();
    pendingClientMessageRef.current.clear();
    lastSeqRef.current = 0;
    lastReadSeqRef.current = 0;
    reactionLoadedRef.current.clear();
    reactionFetchRef.current.clear();
    pendingStreamMessageIdRef.current = null;
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

  const waitForSessionReady = useCallback(async () => {
    if (sessionReadyRef.current) return;
    if (typeof window === 'undefined') throw new Error('Chat session is not available in this environment.');
    const start = Date.now();
    while (!sessionReadyRef.current) {
      if (isDisposedRef.current) throw new Error('Chat session was disposed.');
      if (Date.now() - start > SESSION_READY_TIMEOUT_MS) {
        throw new Error('Secure session is not ready yet. Please try again in a moment.');
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, []);

  const sendFrame = useCallback((frame: { type: string; data: Record<string, unknown>; request_id?: string }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('Chat connection not open');
    ws.send(JSON.stringify(frame));
  }, []);

  const sendReadUpdate = useCallback((seq: number) => {
    const activeConversationId = conversationIdRef.current;
    if (!activeConversationId || !isSocketReadyRef.current) return;
    if (seq <= lastReadSeqRef.current) return;
    lastReadSeqRef.current = seq;
    try {
      sendFrame({
        type: 'read.update',
        data: { conversation_id: activeConversationId, last_read_seq: seq }
      });
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[ChatRoom] Failed to send read.update', error);
    }
  }, [sendFrame]);

  const applyConversationMetadata = useCallback((metadata: ConversationMetadata | null) => {
    conversationMetadataRef.current = metadata;
    hasLoggedIntentRef.current = Boolean(metadata?.first_message_intent);
    setConversationMetadata(metadata);
    onConversationMetadataUpdated?.(metadata);
  }, [onConversationMetadataUpdated]);

  const updateConversationMetadata = useCallback(async (
    patch: ConversationMetadata,
    targetConversationId?: string
  ) => {
    if (!sessionReady) return null;
    const activeConversationId = targetConversationId ?? conversationId;
    const practiceKey = practiceId;
    if (!activeConversationId || !practiceKey) return null;

    const runUpdate = async () => {
      const current = conversationMetadataRef.current ?? {};
      const nextMetadata = { ...current, ...patch };
      applyConversationMetadata(nextMetadata);
      const updated = await patchConversationMetadata(activeConversationId, practiceKey, nextMetadata);
      applyConversationMetadata(updated?.user_info ?? nextMetadata);
      return updated;
    };

    const queued = metadataUpdateQueueRef.current.then(runUpdate, runUpdate);
    metadataUpdateQueueRef.current = queued.catch(() => null);
    return queued;
  }, [applyConversationMetadata, conversationId, practiceId, sessionReady]);

  const intakeConversationState = useMemo(
    () => conversationMetadata?.intakeConversationState ?? null,
    [conversationMetadata]
  );
  const slimContactDraft = useMemo(
    () => normalizeSlimContactDraft(conversationMetadata?.intakeSlimContactDraft),
    [conversationMetadata?.intakeSlimContactDraft]
  );
  const isAiBriefActive = conversationMetadata?.intakeAiBriefActive === true;

  const applyIntakeFields = useCallback(async (fields: IntakeFieldsPayload) => {
    const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
    const next: IntakeConversationState = { ...current };
    if (typeof fields.practiceArea === 'string') next.practiceArea = fields.practiceArea;
    if (typeof fields.practiceAreaName === 'string') next.practiceAreaName = fields.practiceAreaName;
    if (typeof fields.description === 'string') next.description = fields.description;
    if (typeof fields.urgency === 'string') next.urgency = fields.urgency;
    if (typeof fields.opposingParty === 'string') next.opposingParty = fields.opposingParty;
    if (typeof fields.city === 'string') next.city = fields.city;
    if (typeof fields.state === 'string') next.state = fields.state;
    if (typeof fields.postalCode === 'string') next.postalCode = fields.postalCode;
    if (typeof fields.country === 'string') next.country = fields.country;
    if (typeof fields.addressLine1 === 'string') next.addressLine1 = fields.addressLine1;
    if (typeof fields.addressLine2 === 'string') next.addressLine2 = fields.addressLine2;
    if (typeof fields.desiredOutcome === 'string') next.desiredOutcome = fields.desiredOutcome;
    if (typeof fields.courtDate === 'string') next.courtDate = fields.courtDate;
    if (typeof fields.income === 'string') next.income = fields.income;
    if (typeof fields.householdSize === 'number') next.householdSize = fields.householdSize;
    if (typeof fields.hasDocuments === 'boolean') next.hasDocuments = fields.hasDocuments;
    if (Array.isArray(fields.eligibilitySignals)) {
      next.eligibilitySignals = fields.eligibilitySignals.filter((v): v is string => typeof v === 'string');
    }
    if (fields.caseStrength === 'needs_more_info' || fields.caseStrength === 'developing' || fields.caseStrength === 'strong') {
      next.caseStrength = fields.caseStrength;
    }
    if (fields.missingSummary !== undefined) next.missingSummary = fields.missingSummary ?? null;
    next.turnCount = (current.turnCount ?? 0) + 1;
    if (next.caseStrength === 'developing' || next.caseStrength === 'strong') next.ctaShown = true;
    if (current.ctaResponse === 'not_yet') next.ctaResponse = null;

    await updateConversationMetadata({ intakeConversationState: next });
  }, [updateConversationMetadata]);

  const fetchConversationMetadata = useCallback(async (
    signal?: AbortSignal,
    targetConversationId?: string
  ) => {
    if (!sessionReady) return;
    const activeConversationId = targetConversationId ?? conversationId;
    const practiceKey = practiceId;
    if (!activeConversationId || !practiceKey) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(activeConversationId)}?practiceId=${encodeURIComponent(practiceKey)}`,
      { method: 'GET', headers, credentials: 'include', signal }
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

  const toUIMessage = useCallback((msg: ConversationMessage): ChatMessageUI => {
    const senderId = typeof msg.user_id === 'string' && msg.user_id.trim().length > 0
      ? msg.user_id
      : null;
    const normalizedRole = msg.role === 'assistant'
      ? 'assistant'
      : msg.role === 'system'
        ? 'system'
        : 'user';
    const isUser = normalizedRole === 'user'
      && Boolean(senderId && currentUserId && senderId === currentUserId);
    const paymentRequest = parsePaymentRequestMetadata(msg.metadata);

    return {
      id: msg.id,
      role: normalizedRole,
      content: msg.content,
      reply_to_message_id: msg.reply_to_message_id ?? null,
      timestamp: new Date(msg.created_at).getTime(),
      metadata: { ...(msg.metadata || {}), __client_id: msg.client_id },
      userId: senderId,
      files: msg.metadata?.attachments
        ? (msg.metadata.attachments as string[]).map((fileId: string) => ({
            id: fileId,
            name: 'File',
            size: 0,
            type: 'application/octet-stream',
            url: buildFileUrl(fileId),
          }))
        : undefined,
      paymentRequest,
      isUser
    };
  }, [currentUserId]);

  // ---------------------------------------------------------------------------
  // Streaming bubble helpers
  // ---------------------------------------------------------------------------

  /** Insert a new empty streaming bubble for AI replies */
  const addStreamingBubble = useCallback((bubbleId: string) => {
    const bubble: ChatMessageUI = {
      id: bubbleId,
      role: 'assistant',
      content: '',
      isUser: false,
      isStreaming: true,
      timestamp: Date.now(),
      userId: null,
      reply_to_message_id: null,
      metadata: { source: 'ai' }
    };
    setMessages(prev => [...prev, bubble]);
  }, []);

  /** Append a token to the streaming bubble */
  const appendStreamingToken = useCallback((bubbleId: string, token: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === bubbleId
        ? { ...msg, content: msg.content + token } as ChatMessageUI
        : msg
    ));
  }, []);

  /** Remove the streaming bubble — called either on error or when the
   *  persisted message arrives via WebSocket and replaces it */
  const removeStreamingBubble = useCallback((bubbleId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== bubbleId));
  }, []);

  // ---------------------------------------------------------------------------
  // Server message application
  // ---------------------------------------------------------------------------

  const applyServerMessages = useCallback((incoming: ConversationMessage[]) => {
    if (incoming.length === 0 || isDisposedRef.current) return;

    let nextLatestSeq = lastSeqRef.current;
    const replacements = new Map<string, ChatMessageUI>();
    const additions: ChatMessageUI[] = [];

    for (const message of incoming) {
      if (!message?.id) continue;
      const seqValue = typeof message.seq === 'number' && Number.isFinite(message.seq)
        ? message.seq
        : null;
      if (seqValue !== null) nextLatestSeq = Math.max(nextLatestSeq, seqValue);
      if (messageIdSetRef.current.has(message.id)) continue;
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
        next = next.map(msg => {
          const replacement = replacements.get(msg.id);
          if (!replacement) return msg;
          return {
            ...replacement,
            timestamp: msg.timestamp,
            files: replacement.files ?? msg.files,
            reactions: replacement.reactions ?? msg.reactions
          } as ChatMessageUI;
        });
      } else {
        next = [...next];
      }

      if (additions.length > 0) {
        // If the incoming message matches what we were waiting for from the
        // streaming path, remove the streaming bubble and add the real message.
        const pendingId = pendingStreamMessageIdRef.current;
        if (pendingId) {
          const matchIndex = additions.findIndex(m => m.id === pendingId);
          if (matchIndex !== -1) {
            pendingStreamMessageIdRef.current = null;
            // Clear orphan timer if it's running
            if (orphanTimerRef.current !== null) {
              clearTimeout(orphanTimerRef.current);
              orphanTimerRef.current = null;
            }
            // Remove streaming bubble
            next = next.filter(m => !m.id.startsWith(STREAMING_BUBBLE_PREFIX));
          }
        }
        next = [...next, ...additions];
      }

      return next.sort((a, b) => a.timestamp - b.timestamp);
    });

    sendReadUpdate(nextLatestSeq);
  }, [sendReadUpdate, toUIMessage]);

  const ingestServerMessages = useCallback((incoming: ConversationMessage[]) => {
    applyServerMessages(incoming);
  }, [applyServerMessages]);

  const handleMessageAck = useCallback((data: Record<string, unknown>) => {
    const clientId = typeof data.client_id === 'string' ? data.client_id : null;
    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const seqValue = typeof data.seq === 'number' ? data.seq : Number(data.seq);
    const serverTs = typeof data.server_ts === 'string' ? data.server_ts : null;
    if (!clientId || !messageId || !serverTs || !Number.isFinite(seqValue)) return;

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
    setMessages(prev => prev.map(msg =>
      msg.id !== pendingId ? msg : { ...msg, id: messageId } as ChatMessageUI
    ));
    sendReadUpdate(lastSeqRef.current);
  }, [sendReadUpdate]);

  const handleMessageNew = useCallback((data: Record<string, unknown>) => {
    const conversationIdValue = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    const activeConversationId = conversationIdRef.current;
    if (!conversationIdValue || conversationIdValue !== activeConversationId) return;

    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const clientId = typeof data.client_id === 'string' ? data.client_id : null;
    const content = typeof data.content === 'string' ? data.content : null;
    const role = typeof data.role === 'string' ? data.role : null;
    const serverTs = typeof data.server_ts === 'string' ? data.server_ts : null;
    const seqValue = typeof data.seq === 'number' ? data.seq : Number(data.seq);
    if (!messageId || !clientId || !content || !serverTs || !Number.isFinite(seqValue)) return;

    const replyToMessageId = typeof data.reply_to_message_id === 'string'
      ? data.reply_to_message_id
      : null;
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
      reply_to_message_id: replyToMessageId,
      metadata: metadata ?? (attachments.length > 0 ? { attachments } : null),
      client_id: clientId,
      seq: seqValue,
      server_ts: serverTs,
      token_count: null,
      created_at: serverTs
    };

    applyServerMessages([message]);
  }, [applyServerMessages]);

  const updateMessageReactions = useCallback((messageId: string, reactions: MessageReaction[]) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, reactions } as ChatMessageUI : msg
    ));
  }, []);

  const getOptimisticReactions = useCallback((
    reactions: MessageReaction[],
    emoji: string,
    shouldAdd: boolean
  ): MessageReaction[] => {
    const next = [...reactions];
    const index = next.findIndex((r) => r.emoji === emoji);
    if (index === -1 && shouldAdd) {
      next.push({ emoji, count: 1, reactedByMe: true });
      return next;
    }
    if (index === -1) return next;
    const current = next[index];
    const nextCount = Math.max(0, (current.count ?? 0) + (shouldAdd ? 1 : -1));
    if (!shouldAdd && nextCount === 0) {
      next.splice(index, 1);
      return next;
    }
    next[index] = { ...current, count: nextCount, reactedByMe: shouldAdd };
    return next;
  }, []);

  const handleReactionUpdate = useCallback((data: Record<string, unknown>) => {
    const conversationIdValue = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    const activeConversationId = conversationIdRef.current;
    if (!conversationIdValue || conversationIdValue !== activeConversationId) return;

    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const emoji = typeof data.emoji === 'string' ? data.emoji : null;
    const action = typeof data.action === 'string' ? data.action : null;
    const actorId = typeof data.user_id === 'string' ? data.user_id : null;
    const countValue = typeof data.count === 'number' ? data.count : Number(data.count);
    const count = Number.isFinite(countValue) ? countValue : null;
    if (!messageId || !emoji || (action !== 'add' && action !== 'remove')) return;

    reactionLoadedRef.current.add(messageId);

    setMessages(prev => {
      let changed = false;
      const next = prev.map(msg => {
        if (msg.id !== messageId) return msg;
        const existing = msg.reactions ?? [];
        const index = existing.findIndex(r => r.emoji === emoji);
        const current = index >= 0 ? existing[index] : null;
        const shouldReact = action === 'add';
        const reactedByMe = actorId && currentUserId
          ? actorId === currentUserId
            ? shouldReact
            : current?.reactedByMe ?? false
          : current?.reactedByMe ?? false;

        const nextCount = count !== null
          ? Math.max(0, count)
          : Math.max(0, (current?.count ?? 0) + (shouldReact ? 1 : -1));

        if (!current && !shouldReact) return msg;

        let updated = existing;
        if (nextCount <= 0) {
          if (index === -1) return msg;
          updated = existing.filter((r) => r.emoji !== emoji);
        } else if (index === -1) {
          updated = [...existing, { emoji, count: nextCount, reactedByMe }];
        } else {
          updated = existing.map((r, i) =>
            i === index ? { ...r, count: nextCount, reactedByMe } : r
          );
        }

        if (updated === existing) return msg;
        changed = true;
        return { ...msg, reactions: updated } as ChatMessageUI;
      });
      return changed ? next : prev;
    });
  }, [currentUserId]);

  const fetchGapMessages = useCallback(async (fromSeq: number, latestSeq: number) => {
    const activeConversationId = conversationIdRef.current;
    const activePracticeId = practiceIdRef.current;
    if (!activeConversationId || !activePracticeId) return;

    let nextSeq: number | null = fromSeq;
    let targetLatest = latestSeq;
    let attempts = 0;

    while (nextSeq !== null && nextSeq <= targetLatest) {
      if (
        isDisposedRef.current ||
        conversationIdRef.current !== activeConversationId ||
        practiceIdRef.current !== activePracticeId
      ) return;

      try {
        const params = new URLSearchParams({
          practiceId: activePracticeId,
          from_seq: String(nextSeq),
          limit: String(GAP_FETCH_LIMIT)
        });
        const response = await fetch(
          `${getConversationMessagesEndpoint(activeConversationId)}?${params.toString()}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' }
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        const data = await response.json() as {
          success: boolean;
          error?: string;
          data?: { messages: ConversationMessage[]; latest_seq?: number; next_from_seq?: number | null };
        };
        if (!data.success || !data.data) throw new Error(data.error || 'Failed to fetch message gap');
        if (
          isDisposedRef.current ||
          conversationIdRef.current !== activeConversationId ||
          practiceIdRef.current !== activePracticeId
        ) return;
        applyServerMessages(data.data.messages ?? []);
        if (typeof data.data.latest_seq === 'number') targetLatest = data.data.latest_seq;
        nextSeq = data.data.next_from_seq ?? null;
        attempts = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to recover message gap';
        attempts += 1;
        if (attempts < MAX_GAP_FETCH_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, GAP_FETCH_RETRY_DELAY_MS * attempts));
          continue;
        }
        onError?.(message);
        return;
      }
    }
  }, [applyServerMessages, onError]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((targetConversationId: string) => {
    if (isDisposedRef.current || isClosingSocketRef.current) return;
    if (!sessionReadyRef.current || !targetConversationId) return;
    if (conversationIdRef.current !== targetConversationId) return;
    if (reconnectTimerRef.current) return;
    const nextAttempt = reconnectAttemptRef.current + 1;
    if (nextAttempt > RECONNECT_MAX_ATTEMPTS) return;
    reconnectAttemptRef.current = nextAttempt;
    const backoff = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (nextAttempt - 1), RECONNECT_MAX_DELAY_MS);
    const jitter = Math.floor(Math.random() * 250);
    reconnectTimerRef.current = globalThis.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (isDisposedRef.current || isClosingSocketRef.current) return;
      if (!sessionReadyRef.current || conversationIdRef.current !== targetConversationId) return;
      connectChatRoomRef.current(targetConversationId);
    }, backoff + jitter);
  }, []);

  const connectChatRoom = useCallback((targetConversationId: string) => {
    if (!sessionReady) return;
    if (!targetConversationId) return;
    clearReconnectTimer();
    if (typeof WebSocket === 'undefined') {
      onError?.('WebSocket is not available in this environment.');
      return;
    }
    if (
      wsRef.current &&
      socketConversationIdRef.current === targetConversationId &&
      wsRef.current.readyState === WebSocket.OPEN &&
      isSocketReadyRef.current
    ) return;

    isClosingSocketRef.current = false;
    socketSessionRef.current += 1;
    const sessionId = socketSessionRef.current;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    socketConversationIdRef.current = targetConversationId;
    initSocketReadyPromise();

    const ws = new WebSocket(getConversationWsEndpoint(targetConversationId));
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      ws.send(JSON.stringify({
        type: 'auth',
        data: { protocol_version: CHAT_PROTOCOL_VERSION, client_info: { platform: 'web' } }
      }));
    });

    ws.addEventListener('message', (event) => {
      if (socketSessionRef.current !== sessionId || typeof event.data !== 'string') return;
      let frame: { type?: string; data?: Record<string, unknown>; request_id?: string };
      try {
        frame = JSON.parse(event.data) as { type?: string; data?: Record<string, unknown>; request_id?: string };
      } catch { return; }
      if (!frame.type || !frame.data || typeof frame.data !== 'object') return;

      switch (frame.type) {
        case 'auth.ok': {
          resolveSocketReady();
          try {
            sendFrame({
              type: 'resume',
              data: { conversation_id: targetConversationId, last_seq: lastSeqRef.current }
            });
          } catch (error) {
            if (import.meta.env.DEV) console.warn('[ChatRoom] Failed to send resume', error);
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
              if (import.meta.env.DEV) console.warn('[ChatRoom] Gap fetch failed', error);
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
        case 'reaction.update':
          handleReactionUpdate(frame.data);
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
      if (socketSessionRef.current !== sessionId) return;
      isSocketReadyRef.current = false;
      rejectSocketReady(new Error('Chat connection closed'));
      flushPendingAcks(new Error('Chat connection closed'));
      if (wsRef.current === ws) {
        wsRef.current = null;
        socketConversationIdRef.current = null;
      }
      if (!isClosingSocketRef.current && conversationIdRef.current === targetConversationId) {
        if (import.meta.env.DEV) console.info('[ChatRoom] WebSocket closed; will reconnect on next action.');
        scheduleReconnect(targetConversationId);
      }
    });

    ws.addEventListener('error', (error) => {
      if (import.meta.env.DEV) console.warn('[ChatRoom] WebSocket error', error);
    });
  }, [
    clearReconnectTimer,
    fetchGapMessages,
    flushPendingAcks,
    handleMessageAck,
    handleMessageNew,
    handleReactionUpdate,
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

  const sendMessageOverWs = useCallback(async (
    content: string,
    attachments: FileAttachment[],
    metadata?: Record<string, unknown> | null,
    replyToMessageId?: string | null
  ) => {
    const effectivePracticeId = (practiceIdRef.current ?? '').trim();
    const activeConversationId = conversationIdRef.current;
    if (!effectivePracticeId || !activeConversationId) return;
    if (!content.trim()) throw new Error('Message cannot be empty.');

    const clientId = createClientId();
    const tempId = `temp-${clientId}`;
    const tempMessage: ChatMessageUI = {
      id: tempId,
      content,
      isUser: true,
      role: 'user',
      timestamp: Date.now(),
      userId: currentUserId,
      reply_to_message_id: replyToMessageId ?? null,
      metadata: { ...(metadata || {}), __client_id: clientId },
      files: attachments
    };

    setMessages(prev => [...prev, tempMessage]);
    setMessagesReady(true);
    pendingClientMessageRef.current.set(clientId, tempId);

    const ackPromise = new Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }>((resolve, reject) => {
      pendingAckRef.current.set(clientId, { resolve, reject });
    });

    const attachmentIds = attachments.map(att => att.id || att.storageKey || '').filter(Boolean);

    try {
      await waitForSessionReady();
      if (!isSocketReadyRef.current || socketConversationIdRef.current !== activeConversationId) {
        connectChatRoomRef.current(activeConversationId);
      }
      await waitForSocketReady();
      sendFrame({
        type: 'message.send',
        data: {
          conversation_id: activeConversationId,
          client_id: clientId,
          content,
          ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
          ...(attachmentIds.length > 0 ? { attachments: attachmentIds } : {}),
          ...(metadata ? { metadata } : {})
        },
        request_id: clientId
      });
    } catch (error) {
      pendingAckRef.current.delete(clientId);
      pendingClientMessageRef.current.delete(clientId);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      throw error;
    }

    return ackPromise.catch((error) => {
      pendingClientMessageRef.current.delete(clientId);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      throw error;
    });
  }, [currentUserId, sendFrame, waitForSessionReady, waitForSocketReady]);

  const pendingIntakeInitRef = useRef<Promise<void> | null>(null);

  // ---------------------------------------------------------------------------
  // Main send function
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(async (
    message: string,
    attachments: FileAttachment[] = [],
    replyToMessageId?: string | null
  ) => {
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_SEND_MESSAGE__) {
      window.__DEBUG_SEND_MESSAGE__(message, attachments);
    }

    const activeMode = conversationMetadataRef.current?.mode ?? mode;
    const shouldUseAi = activeMode === 'ASK_QUESTION' || activeMode === 'REQUEST_CONSULTATION';
    const shouldClassifyIntent = activeMode === 'ASK_QUESTION';
    const hasUserMessages = messages.some((msg) => msg.isUser);
    const trimmedMessage = message.trim();

    if (activeMode === 'REQUEST_CONSULTATION' && !conversationMetadataRef.current?.intakeConversationState) {
      if (pendingIntakeInitRef.current) {
        try {
          await pendingIntakeInitRef.current;
        } catch (error) {
          console.error('Failed to await pending intake init', error);
        }
      } else {
        const initPromise = updateConversationMetadata({ intakeConversationState: initialIntakeState });
        pendingIntakeInitRef.current = initPromise as unknown as Promise<void>;
        try {
          await initPromise;
        } finally {
          pendingIntakeInitRef.current = null;
        }
      }
    }

    try {
      await sendMessageOverWs(message, attachments, undefined, replyToMessageId ?? null);

      if (!shouldUseAi || trimmedMessage.length === 0) return;

      const resolvedPracticeId = (practiceId ?? '').trim();
      if (!resolvedPracticeId) return;

      if (shouldClassifyIntent && !hasLoggedIntentRef.current && !hasUserMessages) {
        intentAbortRef.current?.abort();
        const intentController = new AbortController();
        intentAbortRef.current = intentController;
        const intentConversationId = conversationId;
        const intentPracticeId = resolvedPracticeId;
        let intentResponse: Response | null = null;
        try {
          intentResponse = await fetch('/api/ai/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: intentController.signal,
            body: JSON.stringify({ conversationId, practiceId: resolvedPracticeId, message: trimmedMessage })
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
          if (intentController.signal.aborted) return;
          if (conversationIdRef.current !== intentConversationId || resolvedPracticeId !== intentPracticeId) return;
          if (hasLoggedIntentRef.current) return;
          hasLoggedIntentRef.current = true;
          try {
            await updateConversationMetadata({ first_message_intent: intentData }, intentConversationId);
          } catch (intentError) {
            console.warn('[useMessageHandling] Failed to persist intent classification', intentError);
          }
        } else if (intentResponse) {
          console.warn('[useMessageHandling] Intent classification request failed', { status: intentResponse.status });
        }
      }

      const aiMessages = [
        ...messages
          .filter((msg) =>
            msg.role === 'user' ||
            msg.role === 'assistant' ||
            (msg.role === 'system' && msg.metadata?.source === 'ai')
          )
          // Exclude streaming bubble from history
          .filter((msg) => !msg.id.startsWith(STREAMING_BUBBLE_PREFIX))
          .map((msg) => ({
            role: msg.role === 'system' ? 'assistant' : msg.role,
            content: msg.content
          })),
        { role: 'user' as const, content: trimmedMessage }
      ];

      const resolvedPracticeSlug = (practiceSlug ?? '').trim() || undefined;
      const intakeSubmitted = messages.some((msg) => msg.isUser && msg.metadata?.isContactFormSubmission);

      // Add streaming bubble before the fetch so the user sees something immediately
      const bubbleId = `${STREAMING_BUBBLE_PREFIX}${conversationId}`;
      addStreamingBubble(bubbleId);

      // Create and store AbortController for this stream
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const aiResponse = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          credentials: 'include',
          signal: abortController.signal,
          body: JSON.stringify({
            conversationId,
            practiceId: resolvedPracticeId,
            practiceSlug: resolvedPracticeSlug,
            mode: activeMode,
            intakeSubmitted,
            messages: aiMessages
          })
        });

        if (!aiResponse.ok) {
          removeStreamingBubble(bubbleId);
          const errorData = await aiResponse.json().catch(() => ({})) as { error?: string };
          throw new Error(errorData.error || `HTTP ${aiResponse.status}`);
        }

        const contentType = aiResponse.headers.get('content-type') ?? '';

        // ---------------------------------------------------------------------------
        // JSON fallback — short-circuit replies (legal disclaimer, service list, etc.)
        // come back as JSON. The worker streams everything else, but these instant
        // replies don't need streaming and return the old format unchanged.
        // ---------------------------------------------------------------------------
        if (contentType.includes('application/json')) {
          removeStreamingBubble(bubbleId);
          const aiData = await aiResponse.json() as {
            reply?: string;
            message?: ConversationMessage;
            intakeFields?: IntakeFieldsPayload | null;
          };
          if (aiData.intakeFields) await applyIntakeFields(aiData.intakeFields);
          if (aiData.message) {
            // Let WebSocket message.new deliver the persisted message to avoid
            // racing local insertion against socket broadcast.
            return;
          }
          const reply = (aiData.reply ?? '').trim();
          if (!reply) throw new Error('AI response missing');
          if (import.meta.env.DEV) console.warn('[useMessageHandling] AI returned reply without persisted message');
          onError?.('Something went wrong. Please try again.');
          return;
        }

        // ---------------------------------------------------------------------------
        // SSE streaming path
        // ---------------------------------------------------------------------------
        if (!aiResponse.body) {
          removeStreamingBubble(bubbleId);
          throw new Error('AI response body is null');
        }

        const reader = aiResponse.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        const processEvent = async (eventData: string) => {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(eventData) as Record<string, unknown>;
          } catch {
            return;
          }

          // Token chunk — append to streaming bubble
          if (typeof parsed.token === 'string') {
            appendStreamingToken(bubbleId, parsed.token);
            return;
          }

          // Done event — intake fields are available, real message is being persisted
          if (parsed.done === true) {
            if (parsed.intakeFields && typeof parsed.intakeFields === 'object') {
              applyIntakeFields(parsed.intakeFields as IntakeFieldsPayload).catch((err) => {
                console.warn('[useMessageHandling] Failed to apply intake fields from stream', err);
              });
            }
            // quickReplies are stored on the persisted message metadata by the worker,
            // they'll arrive via the WebSocket message.new frame — nothing to do here
            return;
          }

          // Persisted event — worker has saved the message, WebSocket will deliver it.
          // Check if the message already exists (race condition: WebSocket arrived before SSE).
          if (parsed.persisted === true && typeof parsed.messageId === 'string') {
            const messageExists = messagesRef.current?.some(m => m.id === parsed.messageId);
            if (messageExists) {
              removeStreamingBubble(bubbleId);
              return;
            }
            pendingStreamMessageIdRef.current = parsed.messageId;
            return;
          }

          // Error event from worker
          if (parsed.error === true) {
            removeStreamingBubble(bubbleId);
            onError?.(typeof parsed.message === 'string' ? parsed.message : 'Something went wrong. Please try again.');
            return;
          }
        };

        while (true) {
          if (abortController.signal.aborted) {
            removeStreamingBubble(bubbleId);
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() ?? '';

          for (const event of events) {
            const dataLine = event.split('\n').find(line => line.startsWith('data: '));
            if (!dataLine) continue;
            await processEvent(dataLine.slice(6));
          }
        }

        // Flush any remaining buffer
        if (sseBuffer.trim()) {
          const dataLine = sseBuffer.split('\n').find(line => line.startsWith('data: '));
          if (dataLine) await processEvent(dataLine.slice(6));
        }

        // If the persisted event never arrived (worker error / disconnect),
        // handle the cleanup: remove empty bubbles, mark non-empty ones as orphaned
        if (pendingStreamMessageIdRef.current === null) {
          setMessages(prev => {
            const bubble = prev.find(m => m.id === bubbleId);
            if (!bubble) return prev;

            // If content is empty, remove the bubble entirely
            if (!bubble.content.trim()) {
              return prev.filter(m => m.id !== bubbleId);
            }

            // If content exists, mark as orphaned with expiry timestamp
            // so the UI can show a retry/expired state
            const orphanExpiryMs = 30000; // 30 seconds
            const orphanedBubble = {
              ...bubble,
              metadata: {
                ...bubble.metadata,
                isOrphan: true,
                orphanExpiryTime: Date.now() + orphanExpiryMs
              }
            };

            // Schedule cleanup after expiry if no persisted message arrives
            const orphanTimer = setTimeout(() => {
              setMessages(current => current.filter(m => m.id !== bubbleId));
              orphanTimerRef.current = null;
            }, orphanExpiryMs);
            orphanTimerRef.current = orphanTimer;

            return prev.map(m => m.id === bubbleId ? orphanedBubble : m);
          });
        }

      } catch (streamError) {
        if (streamError instanceof Error && streamError.name === 'AbortError') {
          // Normal cancellation, already removed bubble above
          return;
        }
        removeStreamingBubble(bubbleId);
        throw streamError;
      }

    } catch (error) {
      console.error('Error sending message:', {
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      const errorMessage = error instanceof Error && error.message
        ? error.message
        : 'Failed to send message. Please try again.';
      onError?.(errorMessage);
    }
  }, [
    addStreamingBubble,
    appendStreamingToken,
    applyIntakeFields,
    conversationId,
    messages,
    mode,
    onError,
    practiceId,
    practiceSlug,
    removeStreamingBubble,
    sendMessageOverWs,
    updateConversationMetadata
  ]);

  // ---------------------------------------------------------------------------
  // Intake flow handlers — unchanged from original
  // ---------------------------------------------------------------------------

  const handleIntakeCtaResponse = useCallback(async (response: 'ready' | 'not_yet') => {
    const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
    const next: IntakeConversationState = {
      ...current,
      ctaResponse: response,
      ctaShown: true,
      notYetCount: response === 'not_yet' ? (current.notYetCount ?? 0) + 1 : (current.notYetCount ?? 0)
    };
    await updateConversationMetadata({ intakeConversationState: next });
    if (response === 'ready') return;
    try {
      await sendMessage('Not yet', []);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[Intake] Failed to send "Not yet" response', error);
    }
  }, [sendMessage, updateConversationMetadata]);

  const resetIntakeCta = useCallback(async () => {
    const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
    const next: IntakeConversationState = { ...current, ctaResponse: null };
    await updateConversationMetadata({ intakeConversationState: next });
  }, [updateConversationMetadata]);

  const handleSlimFormContinue = useCallback(async (draft: ContactData) => {
    const nextDraft: SlimContactDraft = {
      name: (draft.name ?? '').trim(),
      email: (draft.email ?? '').trim(),
      phone: (draft.phone ?? '').trim(),
      city: (draft.city ?? '').trim(),
      state: (draft.state ?? '').trim(),
      ...(draft.opposingParty?.trim() ? { opposingParty: draft.opposingParty.trim() } : {}),
      ...(draft.description?.trim() ? { description: draft.description.trim() } : {})
    };
    await updateConversationMetadata({
      intakeSlimContactDraft: nextDraft,
      intakeAiBriefActive: false
    });

    const practiceContextId = (practiceId ?? '').trim();
    if (!conversationId || !practiceContextId) return;
    const alreadyPosted = messagesRef.current.some((msg) => msg.metadata?.intakeDecisionPrompt === true);
    if (alreadyPosted) return;

    const sanitizedDescription = nextDraft.description?.trim()
      ? sanitizeMarkdown(nextDraft.description.trim().replace(/\s+/g, ' '))
      : '_Not provided_';
    const sanitizedName = sanitizeMarkdown(nextDraft.name);
    const sanitizedLocation = sanitizeMarkdown(`${nextDraft.city}, ${nextDraft.state}`);
    const sanitizedOpposingParty = nextDraft.opposingParty?.trim()
      ? sanitizeMarkdown(nextDraft.opposingParty.trim())
      : '_Not provided_';

    const lines = [
      'Contact info received',
      'Contact details',
      `Name: ${sanitizedName}`,
      'Email: REDACTED',
      'Phone: REDACTED',
      `Location: ${sanitizedLocation}`,
      '',
      'Case summary',
      `Opposing party: ${sanitizedOpposingParty}`,
      `Description: ${sanitizedDescription}`,
      '',
      'Would you like to sign up now, or build a stronger brief first so we can match you with the right attorney?'
    ];

    try {
      const persistedMessage = await postSystemMessage(conversationId, practiceContextId, {
        clientId: 'system-intake-decision',
        content: lines.join('\n'),
        metadata: { systemMessageKey: 'intake_decision_prompt', intakeDecisionPrompt: true }
      });
      if (persistedMessage) applyServerMessages([persistedMessage]);
    } catch (error) {
      console.error('[Intake] Failed to persist decision prompt message', { conversationId, practiceContextId, error });
    }
  }, [applyServerMessages, conversationId, practiceId, updateConversationMetadata]);

  const handleBuildBrief = useCallback(async () => {
    const patch: ConversationMetadata = { intakeAiBriefActive: true };
    if (conversationMetadataRef.current?.mode !== 'REQUEST_CONSULTATION') {
      patch.mode = 'REQUEST_CONSULTATION';
    }
    const current = conversationMetadataRef.current?.intakeConversationState ?? initialIntakeState;
    if (current.ctaResponse !== null) {
      patch.intakeConversationState = { ...current, ctaResponse: null };
    }
    await updateConversationMetadata(patch);
    const locationParts = [slimContactDraft?.city, slimContactDraft?.state]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0);
    const kickoffParts = ['I want to build a stronger brief.'];
    if (locationParts.length > 0) kickoffParts.push(`My location is ${locationParts.join(', ')}.`);
    if (slimContactDraft?.opposingParty?.trim()) kickoffParts.push(`Opposing party: ${slimContactDraft.opposingParty.trim()}.`);
    if (slimContactDraft?.description?.trim()) kickoffParts.push(`My current description: ${slimContactDraft.description.trim()}.`);
    try {
      await sendMessage(kickoffParts.join(' '), []);
    } catch (error) {
      console.error('[Intake] Failed to start brief-building conversation', error);
    }
  }, [sendMessage, slimContactDraft, updateConversationMetadata]);

  const handleContactFormSubmit = useCallback(async (contactData: ContactData) => {
    logDev('[useMessageHandling] handleContactFormSubmit called with:', {
      name: !!contactData.name,
      email: !!contactData.email,
      phone: !!contactData.phone,
      address: !!contactData.address,
      opposingParty: !!contactData.opposingParty,
      description: !!contactData.description
    });
    try {
      const addressText = contactData.address
        ? (() => {
            const parts = [];
            if (contactData.address.address) parts.push(contactData.address.address);
            if (contactData.address.apartment) parts.push(contactData.address.apartment);
            if (contactData.address.city && contactData.address.state && contactData.address.postalCode) {
              parts.push(`${contactData.address.city}, ${contactData.address.state} ${contactData.address.postalCode}`);
            } else {
              if (contactData.address.city) parts.push(contactData.address.city);
              if (contactData.address.state) parts.push(contactData.address.state);
              if (contactData.address.postalCode) parts.push(contactData.address.postalCode);
            }
            return parts.length > 0 ? `Address: ${parts.join(', ')}` : '';
          })()
        : '';
      const opposingPartyText = contactData.opposingParty?.trim() ? contactData.opposingParty.trim() : 'Not provided';
      const descriptionText = contactData.description?.trim() ? contactData.description.trim() : 'Not provided';
      const contactMessage = `Contact info received\nContact details\nName: ${contactData.name}\nEmail: ${contactData.email}\nPhone: ${contactData.phone}${addressText ? `\n${addressText}` : ''}\n\nCase summary\nOpposing party: ${opposingPartyText}\nDescription: ${descriptionText}`;

      if (import.meta.env.MODE === 'development' && typeof window !== 'undefined' && window.__DEBUG_CONTACT_FORM__) {
        const sanitizedContactData = {
          nameProvided: !!contactData.name,
          emailProvided: !!contactData.email,
          phoneProvided: !!contactData.phone,
          addressProvided: !!contactData.address,
          opposingPartyProvided: !!contactData.opposingParty,
          descriptionProvided: !!contactData.description
        };
        const redactedContactMessage = `Contact Information:\nName: ${contactData.name ? '[PROVIDED]' : '[NOT PROVIDED]'}\nEmail: ${contactData.email ? '[PROVIDED]' : '[NOT PROVIDED]'}\nPhone: ${contactData.phone ? '[PROVIDED]' : '[NOT PROVIDED]'}\nAddress: ${contactData.address ? '[PROVIDED]' : '[NOT PROVIDED]'}${contactData.opposingParty ? '\nOpposing Party: [PROVIDED]' : ''}${contactData.description ? '\nDescription: [PROVIDED]' : ''}`;
        window.__DEBUG_CONTACT_FORM__(sanitizedContactData, redactedContactMessage);
      }

      if (!conversationId) throw new Error('Conversation ID is required');
      const resolvedPracticeSlug = (practiceSlug ?? practiceId ?? '').trim();
      if (!resolvedPracticeSlug) throw new Error('Practice slug is required to submit intake');

      const intakeResult = await submitContactForm(
        { ...contactData, sessionId: conversationId, userId: currentUserId },
        resolvedPracticeSlug
      );

      const existingTitle = typeof conversationMetadataRef.current?.title === 'string'
        ? conversationMetadataRef.current.title.trim()
        : '';
      if (!existingTitle) {
        const nextTitle = contactData.name?.trim() || 'New Lead';
        try {
          await updateConversationMetadata({ title: nextTitle }, conversationId);
        } catch (error) {
          console.warn('[ContactForm] Failed to set conversation title', error);
        }
      }

      const paymentDetails = intakeResult.intake;
      const paymentRequired = paymentDetails?.paymentLinkEnabled === true;
      const intakeUuid = typeof paymentDetails?.uuid === 'string' ? paymentDetails.uuid : undefined;

      const nextStepLine = isAnonymous
        ? (paymentRequired
          ? 'Next step: sign up to save your details and continue to payment.'
          : 'Next step: sign up to save your details and finish your intake.')
        : (paymentRequired
          ? 'Next step: complete payment below and we will notify the practice right away.'
          : 'Your intake is submitted. Thank you, someone from the practice will contact you soon.');
      const enrichedContactMessage = `${contactMessage}\n\nThanks! ${nextStepLine}`;

      await sendMessageOverWs(enrichedContactMessage, [], {
        isContactFormSubmission: true,
        ...(intakeUuid ? { intakeUuid } : {}),
        ...(paymentRequired ? { intakePaymentRequired: true } : {}),
        authCta: { label: 'Continue to finish intake' }
      }, null);

      setMessages((prev) => {
        const alreadyPresent = prev.some((msg) =>
          msg.isUser && msg.metadata?.isContactFormSubmission &&
          (intakeUuid ? msg.metadata?.intakeUuid === intakeUuid : true)
        );
        if (alreadyPresent) return prev;
        const fallbackMessage: ChatMessageUI = {
          id: `fallback-contact-${Date.now()}`,
          content: enrichedContactMessage,
          isUser: true,
          role: 'user',
          timestamp: Date.now(),
          userId: currentUserId,
          reply_to_message_id: null,
          metadata: {
            isContactFormSubmission: true,
            ...(intakeUuid ? { intakeUuid } : {}),
            ...(paymentRequired ? { intakePaymentRequired: true } : {}),
            authCta: { label: 'Continue to finish intake' }
          }
        };
        return [...prev, fallbackMessage];
      });

      if (import.meta.env.DEV) console.log('[ContactForm] Successfully submitted contact information');

      const clientSecret = paymentDetails?.clientSecret;
      const paymentLinkUrl = paymentDetails?.paymentLinkUrl;
      const checkoutSessionUrl = paymentDetails?.checkoutSessionUrl;
      const checkoutSessionId = paymentDetails?.checkoutSessionId;
      const hasClientSecret = typeof clientSecret === 'string' && clientSecret.trim().length > 0;
      const hasPaymentLink = typeof paymentLinkUrl === 'string' && paymentLinkUrl.trim().length > 0;
      const hasCheckoutSession = typeof checkoutSessionUrl === 'string' && checkoutSessionUrl.trim().length > 0;

      if (paymentRequired && (hasClientSecret || hasCheckoutSession || hasPaymentLink)) {
        if (isAnonymous) return;
        const paymentMessageId = `system-payment-${paymentDetails.uuid ?? Date.now()}`;
        const paymentMessageExists = messages.some((msg) => msg.id === paymentMessageId);
        if (!paymentMessageExists) {
          const returnTo = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : undefined;
          const practiceContextId = practiceId || resolvedPracticeSlug;
          const paymentUrl = buildIntakePaymentUrl({
            intakeUuid: paymentDetails.uuid,
            clientSecret: hasClientSecret ? clientSecret : undefined,
            paymentLinkUrl: hasPaymentLink ? paymentLinkUrl : undefined,
            checkoutSessionUrl: hasCheckoutSession ? checkoutSessionUrl : undefined,
            checkoutSessionId: checkoutSessionId ?? undefined,
            amount: typeof paymentDetails.amount === 'number' ? asMinor(paymentDetails.amount) : undefined,
            currency: paymentDetails.currency,
            practiceName: paymentDetails.organizationName,
            practiceLogo: paymentDetails.organizationLogo,
            practiceSlug: resolvedPracticeSlug,
            practiceId: practiceContextId,
            conversationId,
            returnTo
          });
          const paymentRequestPayload = {
            intakeUuid: paymentDetails.uuid,
            clientSecret: hasClientSecret ? clientSecret : undefined,
            paymentLinkUrl: hasPaymentLink ? paymentLinkUrl : undefined,
            checkoutSessionUrl: hasCheckoutSession ? checkoutSessionUrl : undefined,
            checkoutSessionId: checkoutSessionId ?? undefined,
            amount: typeof paymentDetails.amount === 'number' ? asMinor(paymentDetails.amount) : undefined,
            currency: paymentDetails.currency,
            practiceName: paymentDetails.organizationName,
            practiceLogo: paymentDetails.organizationLogo,
            practiceSlug: resolvedPracticeSlug,
            practiceId: practiceContextId,
            conversationId,
            returnTo
          };

          let persistenceStatus: 'idle' | 'success' | 'retry_queued' | 'failed' = 'idle';
          if (conversationId && practiceContextId) {
            try {
              const persistedMessage = await postSystemMessage(conversationId, practiceContextId, {
                clientId: paymentMessageId,
                content: 'One more step: submit the consultation fee to complete your intake.',
                metadata: { paymentRequest: paymentRequestPayload, paymentUrl }
              });
              if (persistedMessage) {
                applyServerMessages([persistedMessage]);
                persistenceStatus = 'success';
              }
            } catch (error) {
              console.warn('[Intake] Failed to persist payment message', error);
              setPaymentRetryNotice({
                message: 'Payment message delivery will be retried. You can also pay using the link below.',
                paymentUrl
              });
              persistenceStatus = 'retry_queued';
            }
          }

          if (persistenceStatus === 'idle') throw new Error('Payment message could not be saved. Please retry.');
        }
      }
    } catch (error) {
      console.error('Error submitting contact form:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit contact information');
      throw error;
    }
  }, [
    conversationId,
    practiceId,
    practiceSlug,
    onError,
    logDev,
    messages,
    applyServerMessages,
    sendMessageOverWs,
    updateConversationMetadata,
    currentUserId,
    isAnonymous
  ]);

  const buildContactData = useCallback((draft: SlimContactDraft, intake: IntakeConversationState | null): ContactData => {
    const mergedDescription = intake?.description?.trim() || draft.description?.trim() || '';
    const mergedOpposingParty = intake?.opposingParty?.trim() || draft.opposingParty?.trim() || '';
    return {
      name: draft.name,
      email: draft.email,
      phone: draft.phone,
      city: draft.city,
      state: draft.state,
      opposingParty: mergedOpposingParty || undefined,
      description: mergedDescription || undefined,
      address: { city: draft.city, state: draft.state }
    };
  }, []);

  const handleSubmitNow = useCallback(async () => {
    if (!slimContactDraft) return;
    const merged = buildContactData(
      slimContactDraft,
      conversationMetadataRef.current?.intakeConversationState ?? null
    );
    await handleContactFormSubmit(merged);
  }, [buildContactData, handleContactFormSubmit, slimContactDraft]);

  const addMessage = useCallback((message: ChatMessageUI) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<ChatMessageUI>) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, ...updates } as ChatMessageUI : msg
    ));
  }, []);

  const clearMessages = useCallback(() => {
    resetRealtimeState();
    reactionFetchRef.current.clear();
    reactionLoadedRef.current.clear();
    setMessages([]);
    setHasMoreMessages(false);
    setNextCursor(null);
    setIsLoadingMoreMessages(false);
    setMessagesReady(false);
    isLoadingMoreRef.current = false;
  }, [resetRealtimeState]);

  const fetchMessages = useCallback(async (
    options?: {
      signal?: AbortSignal;
      targetConversationId?: string;
      cursor?: string | null;
      isLoadMore?: boolean;
    }
  ) => {
    if (!sessionReady) return;
    const { signal, targetConversationId, cursor, isLoadMore } = options ?? {};
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) return;

    try {
      const params = new URLSearchParams({ practiceId, limit: '50' });
      params.set('source', isLoadMore ? 'chat_load_more' : 'chat_initial');
      if (cursor) params.set('cursor', cursor);
      if (isLoadMore) setIsLoadingMoreMessages(true);

      const response = await fetch(
        `${getConversationMessagesEndpoint(activeConversationId)}?${params.toString()}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json() as {
        success: boolean;
        error?: string;
        data?: { messages: ConversationMessage[]; hasMore?: boolean; cursor?: string | null };
      };
      if (!data.success || !data.data) throw new Error(data.error || 'Failed to fetch messages');

      if (!isDisposedRef.current && activeConversationId === conversationIdRef.current) {
        if (isLoadMore) {
          applyServerMessages(data.data.messages ?? []);
        } else {
          const uiMessages = data.data.messages.map(toUIMessage);
          messageIdSetRef.current = new Set(data.data.messages.map((msg) => msg.id));
          lastSeqRef.current = data.data.messages.reduce((max, msg) => Math.max(max, msg.seq), 0);
          setMessages(prev => {
            if (uiMessages.length === 0 && prev.length > 0) return prev;
            return uiMessages;
          });
          setMessagesReady(true);
          sendReadUpdate(lastSeqRef.current);
        }
        setHasMoreMessages(Boolean(data.data.hasMore));
        setNextCursor(data.data.cursor ?? null);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      onError?.(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      if (!isDisposedRef.current && isLoadMore) setIsLoadingMoreMessages(false);
    }
  }, [conversationId, practiceId, toUIMessage, onError, sendReadUpdate, sessionReady, applyServerMessages]);

  const loadMoreMessages = useCallback(async () => {
    if (!nextCursor || isLoadingMoreMessages || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      await fetchMessages({ cursor: nextCursor, isLoadMore: true });
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [fetchMessages, isLoadingMoreMessages, nextCursor]);

  const requestMessageReactions = useCallback(async (messageId: string) => {
    const conversationIdValue = conversationIdRef.current;
    const practiceContextId = (practiceIdRef.current ?? '').trim();
    if (!conversationIdValue || !practiceContextId) return null;
    if (isTempMessageId(messageId)) return null;
    if (reactionLoadedRef.current.has(messageId)) return null;
    const existingRequest = reactionFetchRef.current.get(messageId);
    if (existingRequest) return existingRequest;

    const requestPromise = fetchMessageReactions(conversationIdValue, messageId, practiceContextId)
      .then((reactions) => {
        updateMessageReactions(messageId, reactions);
        reactionLoadedRef.current.add(messageId);
        return reactions;
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.warn('[useMessageHandling] Failed to fetch reactions', error);
        reactionLoadedRef.current.delete(messageId);
        return null;
      })
      .finally(() => { reactionFetchRef.current.delete(messageId); });

    reactionFetchRef.current.set(messageId, requestPromise);
    return requestPromise;
  }, [updateMessageReactions]);

  const toggleMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    const conversationIdValue = conversationIdRef.current;
    const practiceContextId = (practiceIdRef.current ?? '').trim();
    if (!conversationIdValue || !practiceContextId) return;
    if (isTempMessageId(messageId)) return;

    const currentMessage = messages.find((msg) => msg.id === messageId);
    const existingReactions = currentMessage?.reactions ?? [];
    const existingReaction = existingReactions.find((r) => r.emoji === emoji);
    const hasReacted = existingReaction?.reactedByMe ?? false;
    const optimisticReactions = getOptimisticReactions(existingReactions, emoji, !hasReacted);
    updateMessageReactions(messageId, optimisticReactions);
    reactionLoadedRef.current.add(messageId);

    try {
      const nextReactions = hasReacted
        ? await removeMessageReaction(conversationIdValue, messageId, practiceContextId, emoji)
        : await addMessageReaction(conversationIdValue, messageId, practiceContextId, emoji);
      updateMessageReactions(messageId, nextReactions);
      reactionLoadedRef.current.add(messageId);
    } catch (error) {
      updateMessageReactions(messageId, existingReactions);
      if (import.meta.env.DEV) console.warn('[useMessageHandling] Failed to update reaction', error);
      onError?.('Failed to update reaction.');
    }
  }, [getOptimisticReactions, messages, onError, updateMessageReactions]);

  const startConsultFlow = useCallback((targetConversationId?: string) => {
    if (!sessionReady || !targetConversationId || !practiceId) return;
    void updateConversationMetadata({
      intakeConversationState: initialIntakeState,
      intakeSlimContactDraft: null,
      intakeAiBriefActive: false
    }, targetConversationId);
    consultFlowAbortRef.current?.abort();
    const controller = new AbortController();
    consultFlowAbortRef.current = controller;
    conversationIdRef.current = targetConversationId;
    setIsConsultFlowActive(true);
    setHasMoreMessages(false);
    setNextCursor(null);
    fetchMessages({ signal: controller.signal, targetConversationId });
    fetchConversationMetadata(controller.signal, targetConversationId).catch((error) => {
      console.warn('[useMessageHandling] Failed to fetch conversation metadata', error);
    });
    connectChatRoom(targetConversationId);
  }, [connectChatRoom, fetchConversationMetadata, fetchMessages, practiceId, sessionReady, updateConversationMetadata]);

  useEffect(() => {
    if (!sessionReady) { closeChatSocket(); return; }
    if (!isConversationLinkReady) { closeChatSocket(); return; }
    if (!conversationId || !practiceId) {
      conversationIdRef.current = undefined;
      closeChatSocket();
      return;
    }
    conversationIdRef.current = conversationId;
    resetRealtimeState();
    setPaymentRetryNotice(null);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setHasMoreMessages(false);
    setNextCursor(null);
    fetchMessages({ signal: controller.signal });
    fetchConversationMetadata(controller.signal).catch((error) => {
      console.warn('[useMessageHandling] Failed to fetch conversation metadata', error);
    });
    connectChatRoom(conversationId);
    return () => { controller.abort(); closeChatSocket(); };
  }, [
    closeChatSocket,
    connectChatRoom,
    conversationId,
    fetchConversationMetadata,
    fetchMessages,
    isConversationLinkReady,
    practiceId,
    resetRealtimeState,
    sessionReady
  ]);

  useEffect(() => { intentAbortRef.current?.abort(); }, [conversationId, practiceId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !conversationId || !practiceId) return;
    const cacheKey = getMessageCacheKey(practiceId, conversationId);
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatMessageUI[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const isValid = parsed.every(
        (msg) => typeof msg.id === 'string' && typeof msg.content === 'string' && typeof msg.timestamp === 'number'
      );
      if (!isValid) { window.localStorage.removeItem(cacheKey); return; }
      // Never restore streaming bubbles from cache
      const filtered = parsed.filter(msg => !msg.id.startsWith(STREAMING_BUBBLE_PREFIX));
      messageIdSetRef.current = new Set(filtered.map((msg) => msg.id));
      setMessages(filtered);
      setMessagesReady(true);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[useMessageHandling] Failed to load cached messages', error);
    }
  }, [conversationId, practiceId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !conversationId || !practiceId || messages.length === 0) return;
    const cacheKey = getMessageCacheKey(practiceId, conversationId);
    // Never cache streaming bubbles
    const trimmed = messages
      .filter(msg => !msg.id.startsWith(STREAMING_BUBBLE_PREFIX))
      .slice(-MESSAGE_CACHE_LIMIT);
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(trimmed));
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[useMessageHandling] Failed to cache messages', error);
    }
  }, [conversationId, messages, practiceId]);

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

  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      abortControllerRef.current?.abort();
      intentAbortRef.current?.abort();
      consultFlowAbortRef.current?.abort();
      closeChatSocket();
    };
  }, [closeChatSocket]);

  const userMessages = messages.filter(m => m.isUser);
  const hasSubmittedContactForm = messages.some(m => m.isUser && m.metadata?.isContactFormSubmission);

  const latestIntakeSubmission = useMemo(() => {
    let intakeUuid: string | null = null;
    let paymentRequired = false;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (!msg?.isUser || !msg.metadata?.isContactFormSubmission) continue;
      const candidateUuid = msg.metadata?.intakeUuid;
      if (typeof candidateUuid === 'string' && candidateUuid.trim().length > 0) {
        intakeUuid = candidateUuid.trim();
      }
      paymentRequired = msg.metadata?.intakePaymentRequired === true;
      break;
    }
    return { intakeUuid, paymentRequired };
  }, [messages]);

  const intakePaymentReceived = useMemo(() => {
    if (!latestIntakeSubmission.intakeUuid) return false;
    if (verifiedPaidIntakeUuids.includes(latestIntakeSubmission.intakeUuid)) return true;
    return messages.some((msg) =>
      msg.metadata?.intakePaymentUuid === latestIntakeSubmission.intakeUuid &&
      msg.metadata?.paymentStatus === 'succeeded'
    );
  }, [latestIntakeSubmission.intakeUuid, messages, verifiedPaidIntakeUuids]);

  const intakeDecision = messages.find(m => {
    const decision = m.metadata?.intakeDecision;
    return decision === 'accepted' || decision === 'rejected';
  })?.metadata?.intakeDecision as 'accepted' | 'rejected' | undefined;

  const currentStep = useMemo((): IntakeStep => {
    if (!isAnonymous) return 'completed';
    if (intakeDecision === 'accepted') return 'accepted';
    if (intakeDecision === 'rejected') return 'rejected';
    if (!isConsultFlowActive) return 'ready';
    if (hasSubmittedContactForm) return 'pending_review';
    if (!slimContactDraft) return 'contact_form_slim';
    if (isAiBriefActive) return 'ai_brief';
    return 'contact_form_decision';
  }, [hasSubmittedContactForm, intakeDecision, isAiBriefActive, isAnonymous, isConsultFlowActive, slimContactDraft]);

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

  const processedPaymentUuidsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const parseStoredFlag = (raw: string | null) => {
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { practiceName?: string; practiceId?: string; conversationId?: string };
      } catch (error) {
        console.warn('[Intake] Failed to parse payment flag', error);
        return null;
      }
    };

    const postPaymentConfirmation = async (uuid: string, practiceName: string) => {
      if (cancelled || !conversationId || !practiceId) return;
      setVerifiedPaidIntakeUuids((prev) => (prev.includes(uuid) ? prev : [...prev, uuid]));
      const messageId = `system-payment-confirm-${uuid}`;
      if (
        processedPaymentUuidsRef.current.has(uuid) ||
        messagesRef.current.some((m) => m.id === messageId || m.metadata?.intakePaymentUuid === uuid)
      ) return;
      if (cancelled) return;
      try {
        if (cancelled) return;
        if (processedPaymentUuidsRef.current.has(uuid)) return;
        processedPaymentUuidsRef.current.add(uuid);
        const persistedMessage = await postSystemMessage(conversationId, practiceId, {
          clientId: messageId,
          content: `Payment received. ${practiceName} will review your intake and follow up here shortly.`,
          metadata: { intakePaymentUuid: uuid, paymentStatus: 'succeeded' }
        });
        if (cancelled) return;
        if (persistedMessage) {
          applyServerMessages([persistedMessage]);
          setPaymentRetryNotice(null);
        } else {
          throw new Error('Payment confirmation message could not be saved.');
        }
      } catch (error) {
        processedPaymentUuidsRef.current.delete(uuid);
        const message = error instanceof Error ? error.message : 'Payment confirmation failed.';
        console.warn('[Intake] Failed to persist payment confirmation message', error);
        onError?.(message);
        throw error;
      }
    };

    const maybeReconcileFromBackend = async () => {
      const intakeUuid = latestIntakeSubmission.intakeUuid;
      if (!intakeUuid || !latestIntakeSubmission.paymentRequired || intakePaymentReceived) return;
      try {
        const isPaid = await fetchIntakePaidStatus(intakeUuid, controller.signal);
        if (!isPaid || cancelled) return;
        await postPaymentConfirmation(intakeUuid, 'the practice');
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        onError?.(errorMessage, { source: 'fetchIntakePaidStatus', intakeUuid });
        console.warn('[Intake] Failed to reconcile payment status on refresh', error);
      }
    };

    if (typeof window !== 'undefined') {
      const paymentKeys: string[] = [];
      const pendingKeys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key && key.startsWith('intakePaymentSuccess:')) paymentKeys.push(key);
        if (key && key.startsWith('intakePaymentPending:')) pendingKeys.push(key);
      }
      paymentKeys.forEach((key) => {
        const uuid = key.split(':')[1];
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuid || !uuidPattern.test(uuid)) {
          console.warn('[Intake] Skipping malformed payment confirmation key', { key });
          return;
        }
        let practiceName = 'the practice';
        const raw = window.sessionStorage.getItem(key);
        const parsed = parseStoredFlag(raw);
        if (parsed?.practiceName && parsed.practiceName.trim().length > 0) {
          practiceName = parsed.practiceName.trim();
        }
        postPaymentConfirmation(uuid, practiceName)
          .then(() => { window.sessionStorage.removeItem(key); })
          .catch((error) => { console.warn('[Intake] Payment confirmation retry failed, keeping session key', error); });
      });
      pendingKeys.forEach((key) => { window.sessionStorage.removeItem(key); });
    }

    void maybeReconcileFromBackend();
    return () => { cancelled = true; controller.abort(); };
  }, [
    latestIntakeSubmission.intakeUuid,
    latestIntakeSubmission.paymentRequired,
    intakePaymentReceived,
    conversationId,
    onError,
    practiceId,
    applyServerMessages
  ]);

  return {
    messages,
    conversationMetadata,
    sendMessage,
    handleContactFormSubmit,
    startConsultFlow,
    addMessage,
    updateMessage,
    ingestServerMessages,
    clearMessages,
    updateConversationMetadata,
    isSocketReady,
    isConsultFlowActive,
    paymentRetryNotice,
    messagesReady,
    hasMoreMessages,
    isLoadingMoreMessages,
    loadMoreMessages,
    requestMessageReactions,
    toggleMessageReaction,
    intakeConversationState,
    handleIntakeCtaResponse,
    resetIntakeCta,
    slimContactDraft,
    handleSlimFormContinue,
    handleBuildBrief,
    handleSubmitNow,
    intakeStatus: {
      step: currentStep,
      decision: intakeDecision,
      intakeUuid: latestIntakeSubmission.intakeUuid,
      paymentRequired: latestIntakeSubmission.paymentRequired,
      paymentReceived: intakePaymentReceived
    }
  };
};
