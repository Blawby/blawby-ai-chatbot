import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { ChatMessageUI, FileAttachment, MessageReaction } from '../../../worker/types';
import type { Address } from '@/shared/types/address';
import type { ContactData } from '@/features/intake/components/ContactForm';
import { getConversationMessagesEndpoint, getConversationWsEndpoint, getIntakeConfirmEndpoint } from '@/config/api';
import { submitContactForm } from '@/shared/utils/forms';
import { buildIntakePaymentUrl, type IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { asMinor } from '@/shared/utils/money';
import type { Conversation, ConversationMessage, ConversationMetadata, ConversationMode, FirstMessageIntent } from '@/shared/types/conversation';
import {
  updateConversationMetadata as patchConversationMetadata,
  fetchMessageReactions,
  addMessageReaction,
  removeMessageReaction,
  postSystemMessage
} from '@/shared/lib/conversationApi';

// Greenfield address validation utilities
function validateAddressObject(addressValue: unknown): Address | null {
  // Normalize input to a processing object
  let obj: Record<string, unknown>;
  if (typeof addressValue === 'string') {
    // If it's a string, we treat it as the primary address line.
    // However, it will fail the required fields check below unless it's a full object.
    obj = { address: addressValue };
  } else if (addressValue && typeof addressValue === 'object' && !Array.isArray(addressValue)) {
    obj = addressValue as Record<string, unknown>;
  } else {
    return null;
  }

  // Map various field names to the Address interface with defensive type checks
  // Candidates include backend (line1) and frontend (address, street, streetAddress) variants
  const rawStreet = obj.line1 || obj.streetAddress || obj.street || obj.address;
  const streetPart = typeof rawStreet === 'string' ? rawStreet : undefined;
  
  const rawApartment = obj.line2 || obj.apartment;
  const apartmentPart = typeof rawApartment === 'string' ? rawApartment : undefined;
  
  const rawPostal = obj.postal_code || obj.postalCode;
  const postalPart = typeof rawPostal === 'string' ? rawPostal : undefined;
  
  const normalized: Partial<Address> = {
    address: streetPart?.trim() || '',
    apartment: apartmentPart?.trim() || undefined,
    city: typeof obj.city === 'string' ? obj.city.trim() : '',
    state: typeof obj.state === 'string' ? obj.state.trim() : '',
    postalCode: postalPart?.trim() || '',
    country: typeof obj.country === 'string' ? obj.country.trim() : '',
  };

  const requiredFields = ['address', 'city', 'state', 'postalCode', 'country'] as const;
  
  // Validate normalized fields against presence and minimal length
  // This ensures string-only inputs (which lack city/state/etc) return null
  for (const field of requiredFields) {
    const value = normalized[field];
    
    if (typeof value !== 'string') {
      return null;
    }
    
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
      return null; // Missing required field
    }
    
    // Basic length validation (at least 2 chars for codes/names, 2 for address)
    if (trimmedValue.length < 2) {
      return null;
    }

    // Simplified field-specific validation (relying on backend for complex patterns)
    if (field === 'postalCode') {
      // Very basic check: just digits or letters, no specific country-dependent patterns here
      // to avoid over-validating and rejecting international formats the backend might accept.
      if (!/^[A-Za-z0-9\s-]{3,12}$/.test(trimmedValue)) {
        return null;
      }
    }
  }
  
  return normalized as Address;
}

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
const SESSION_READY_TIMEOUT_MS = 8000;
const GAP_FETCH_LIMIT = 50;
const MAX_GAP_FETCH_ATTEMPTS = 3;
const GAP_FETCH_RETRY_DELAY_MS = 1000;
const MESSAGE_CACHE_LIMIT = 200;
const RECONNECT_BASE_DELAY_MS = 800;
const RECONNECT_MAX_DELAY_MS = 12000;
const RECONNECT_MAX_ATTEMPTS = 5;

type ContactFormMetadata = {
  fields: string[];
  required: string[];
  message?: string;
  initialValues?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: Address;
    opposingParty?: string;
  };
};

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isTempMessageId = (messageId: string): boolean => messageId.startsWith('temp-') || messageId.startsWith('system-');

const getMessageCacheKey = (practiceId: string, conversationId: string): string => (
  `chat:messages:${practiceId}:${conversationId}`
);

const parseContactFormMetadata = (metadata: unknown): ContactFormMetadata | undefined => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const contactForm = (metadata as { contactForm?: unknown }).contactForm;
  if (!contactForm || typeof contactForm !== 'object' || Array.isArray(contactForm)) {
    return undefined;
  }
  const { fields, required, message, initialValues } = contactForm as Record<string, unknown>;
  if (!Array.isArray(fields) || !fields.every((field) => typeof field === 'string')) {
    return undefined;
  }
  if (!Array.isArray(required) || !required.every((field) => typeof field === 'string')) {
    return undefined;
  }
  if (message !== undefined && typeof message !== 'string') {
    return undefined;
  }
  const normalizedMessage = typeof message === 'string' ? message : undefined;
  let normalizedInitialValues: ContactFormMetadata['initialValues'] | undefined;
  if (initialValues !== undefined) {
    if (!initialValues || typeof initialValues !== 'object' || Array.isArray(initialValues)) {
      return undefined;
    }
    const rawInitialValues = initialValues as Record<string, unknown>;
    const allowedKeys = ['name', 'email', 'phone', 'opposingParty'] as const;
    normalizedInitialValues = {};
    for (const key of allowedKeys) {
      const value = rawInitialValues[key];
      if (value === undefined) {
        continue;
      }
      if (typeof value !== 'string') {
        return undefined;
      }
      normalizedInitialValues[key] = value;
    }
    // Handle address field separately since it's an object
    const addressValue = rawInitialValues['address'];
    if (addressValue !== undefined) {
      const validatedAddress = validateAddressObject(addressValue);
      if (validatedAddress) {
        normalizedInitialValues.address = validatedAddress;
      } else {
        return undefined; // Invalid address
      }
    }
    if (Object.keys(normalizedInitialValues).length === 0) {
      normalizedInitialValues = undefined;
    }
  }
  return {
    fields,
    required,
    message: normalizedMessage,
    initialValues: normalizedInitialValues
  };
};

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
  const { session, isPending: sessionIsPending } = useSessionContext();
  const sessionReady = Boolean(session?.user) && !sessionIsPending;
  const currentUserId = session?.user?.id ?? null;
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
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
  
  // Debug hooks for test environment (development only)
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
    if (isDisposedRef.current) {
      return;
    }
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

  const waitForSessionReady = useCallback(async () => {
    if (sessionReadyRef.current) {
      return;
    }
    if (typeof window === 'undefined') {
      throw new Error('Chat session is not available in this environment.');
    }
    const start = Date.now();
    while (!sessionReadyRef.current) {
      if (isDisposedRef.current) {
        throw new Error('Chat session was disposed.');
      }
      if (Date.now() - start > SESSION_READY_TIMEOUT_MS) {
        throw new Error('Secure session is not ready yet. Please try again in a moment.');
      }
      await new Promise(resolve => setTimeout(resolve, 200));
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
    setConversationMetadata(metadata);
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
    const practiceKey = practiceId;
    if (!activeConversationId || !practiceKey) {
      return null;
    }
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
    const contactForm = parseContactFormMetadata(msg.metadata);
    const paymentRequest = parsePaymentRequestMetadata(msg.metadata);

    return {
      id: msg.id,
      role: normalizedRole,
      content: msg.content,
      reply_to_message_id: msg.reply_to_message_id ?? null,
      timestamp: new Date(msg.created_at).getTime(),
      metadata: msg.metadata || undefined,
      userId: senderId,
      files: msg.metadata?.attachments ? (msg.metadata.attachments as string[]).map((fileId: string) => ({
        id: fileId,
        name: 'File',
        size: 0,
        type: 'application/octet-stream',
        url: '', // TODO: Generate file URL from file ID
      })) : undefined,
      contactForm,
      paymentRequest,
      isUser
    };
  }, [currentUserId]);

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
            files: replacement.files ?? message.files,
            reactions: replacement.reactions ?? message.reactions
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

  const ingestServerMessages = useCallback((incoming: ConversationMessage[]) => {
    applyServerMessages(incoming);
  }, [applyServerMessages]);

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
    setMessages(prev => prev.map(message => (
      message.id === messageId
        ? { ...message, reactions } as ChatMessageUI
        : message
    )));
  }, []);

  const getOptimisticReactions = useCallback((
    reactions: MessageReaction[],
    emoji: string,
    shouldAdd: boolean
  ): MessageReaction[] => {
    const next = [...reactions];
    const index = next.findIndex((reaction) => reaction.emoji === emoji);
    if (index === -1 && shouldAdd) {
      next.push({ emoji, count: 1, reactedByMe: true });
      return next;
    }
    if (index === -1) {
      return next;
    }
    const current = next[index];
    const nextCount = Math.max(0, (current.count ?? 0) + (shouldAdd ? 1 : -1));
    if (!shouldAdd && nextCount === 0) {
      next.splice(index, 1);
      return next;
    }
    next[index] = {
      ...current,
      count: nextCount,
      reactedByMe: shouldAdd
    };
    return next;
  }, []);

  const handleReactionUpdate = useCallback((data: Record<string, unknown>) => {
    const conversationIdValue = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    const activeConversationId = conversationIdRef.current;
    if (!conversationIdValue || conversationIdValue !== activeConversationId) {
      return;
    }

    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const emoji = typeof data.emoji === 'string' ? data.emoji : null;
    const action = typeof data.action === 'string' ? data.action : null;
    const actorId = typeof data.user_id === 'string' ? data.user_id : null;
    const countValue = typeof data.count === 'number' ? data.count : Number(data.count);
    const count = Number.isFinite(countValue) ? countValue : null;

    if (!messageId || !emoji || (action !== 'add' && action !== 'remove')) {
      return;
    }

    reactionLoadedRef.current.add(messageId);

    setMessages(prev => {
      let changed = false;
      const next = prev.map(message => {
        if (message.id !== messageId) {
          return message;
        }
        const existing = message.reactions ?? [];
        const index = existing.findIndex(reaction => reaction.emoji === emoji);
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

        if (!current && !shouldReact) {
          return message;
        }

        let updated = existing;
        if (nextCount <= 0) {
          if (index === -1) {
            return message;
          }
          updated = existing.filter((reaction) => reaction.emoji !== emoji);
        } else if (index === -1) {
          updated = [...existing, { emoji, count: nextCount, reactedByMe }];
        } else {
          updated = existing.map((reaction, reactionIndex) => (
            reactionIndex === index
              ? { ...reaction, count: nextCount, reactedByMe }
              : reaction
          ));
        }

        if (updated === existing) {
          return message;
        }

        changed = true;
        return { ...message, reactions: updated } as ChatMessageUI;
      });

      return changed ? next : prev;
    });
  }, [currentUserId]);

  const fetchGapMessages = useCallback(async (fromSeq: number, latestSeq: number) => {
    const activeConversationId = conversationIdRef.current;
    const activePracticeId = practiceIdRef.current;
    if (!activeConversationId || !activePracticeId) {
      return;
    }

    let nextSeq: number | null = fromSeq;
    let targetLatest = latestSeq;
    let attempts = 0;

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
          practiceId: activePracticeId,
          from_seq: String(nextSeq),
          limit: String(GAP_FETCH_LIMIT)
        });

        const response = await fetch(`${getConversationMessagesEndpoint(activeConversationId)}?${params.toString()}`, {
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
    if (isDisposedRef.current || isClosingSocketRef.current) {
      return;
    }
    if (!sessionReadyRef.current || !targetConversationId) {
      return;
    }
    if (conversationIdRef.current !== targetConversationId) {
      return;
    }
    if (reconnectTimerRef.current) {
      return;
    }
    const nextAttempt = reconnectAttemptRef.current + 1;
    if (nextAttempt > RECONNECT_MAX_ATTEMPTS) {
      return;
    }
    reconnectAttemptRef.current = nextAttempt;
    const backoff = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (nextAttempt - 1), RECONNECT_MAX_DELAY_MS);
    const jitter = Math.floor(Math.random() * 250);
    reconnectTimerRef.current = globalThis.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (isDisposedRef.current || isClosingSocketRef.current) {
        return;
      }
      if (!sessionReadyRef.current || conversationIdRef.current !== targetConversationId) {
        return;
      }
      connectChatRoomRef.current(targetConversationId);
    }, backoff + jitter);
  }, []);


  const connectChatRoom = useCallback((targetConversationId: string) => {
    if (!sessionReady) {
      return;
    }
    if (!targetConversationId) {
      return;
    }
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
    ) {
      return;
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

    const ws = new WebSocket(getConversationWsEndpoint(targetConversationId));
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
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
      if (socketSessionRef.current !== sessionId) {
        return;
      }
      isSocketReadyRef.current = false;
      rejectSocketReady(new Error('Chat connection closed'));
      flushPendingAcks(new Error('Chat connection closed'));
      if (wsRef.current === ws) {
        wsRef.current = null;
        socketConversationIdRef.current = null;
      }
      if (!isClosingSocketRef.current && conversationIdRef.current === targetConversationId) {
        if (import.meta.env.DEV) {
          console.info('[ChatRoom] WebSocket closed; will reconnect on next action.');
        }
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
    if (!effectivePracticeId) {
      return;
    }
    if (!activeConversationId) {
      return;
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
      userId: currentUserId,
      reply_to_message_id: replyToMessageId ?? null,
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
      setMessages(prev => prev.filter(message => message.id !== tempId));
      throw error;
    }

    return ackPromise.catch((error) => {
      pendingClientMessageRef.current.delete(clientId);
      setMessages(prev => prev.filter(message => message.id !== tempId));
      throw error;
    });
  }, [currentUserId, sendFrame, waitForSessionReady, waitForSocketReady]);

  // Main message sending function
  const sendMessage = useCallback(async (
    message: string,
    attachments: FileAttachment[] = [],
    replyToMessageId?: string | null
  ) => {
    // Debug hook for test environment (development only)
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_SEND_MESSAGE__) {
      window.__DEBUG_SEND_MESSAGE__(message, attachments);
    }

    const shouldUseAi = mode === 'ASK_QUESTION';
    const hasUserMessages = messages.some((msg) => msg.isUser);
    const trimmedMessage = message.trim();

    try {
      await sendMessageOverWs(message, attachments, undefined, replyToMessageId ?? null);

      if (!shouldUseAi || trimmedMessage.length === 0) {
        return;
      }

      const resolvedPracticeId = (practiceId ?? '').trim();
      if (!resolvedPracticeId) {
        return;
      }

      if (!hasLoggedIntentRef.current && !hasUserMessages) {
        intentAbortRef.current?.abort();
        const intentController = new AbortController();
        intentAbortRef.current = intentController;
        const intentConversationId = conversationId;
        const intentPracticeId = resolvedPracticeId;
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
              practiceId: resolvedPracticeId,
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
          if (conversationIdRef.current !== intentConversationId || resolvedPracticeId !== intentPracticeId) {
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

      const resolvedPracticeSlug = (practiceSlug ?? '').trim() || undefined;
      const aiResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          practiceId: resolvedPracticeId,
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
    const practiceContextId = (practiceId ?? '').trim();
    if (!practiceContextId) return;

    try {
      const params = new URLSearchParams({ practiceId: practiceContextId });
      const response = await fetch(`${getIntakeConfirmEndpoint()}?${params.toString()}`, {
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
  }, [conversationId, practiceId]);

  // Handle contact form submission
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
      // Format contact data as a structured message
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
      const contactMessage = `Contact Information:
Name: ${contactData.name}
Email: ${contactData.email}
Phone: ${contactData.phone}${addressText ? `\n${addressText}` : ''}${contactData.opposingParty ? `\nOpposing Party: ${contactData.opposingParty}` : ''}${contactData.description ? `\nDescription: ${contactData.description}` : ''}`;

      // Debug hook for test environment (development only, PII-safe)
      if (import.meta.env.MODE === 'development' && typeof window !== 'undefined' && window.__DEBUG_CONTACT_FORM__) {
        // Create sanitized payload with presence flags instead of raw PII
        const sanitizedContactData = {
          nameProvided: !!contactData.name,
          emailProvided: !!contactData.email,
          phoneProvided: !!contactData.phone,
          addressProvided: !!contactData.address,
          opposingPartyProvided: !!contactData.opposingParty,
          descriptionProvided: !!contactData.description
        };
        
        // Create redacted contact message indicating sections without actual values
        const redactedContactMessage = `Contact Information:
Name: ${contactData.name ? '[PROVIDED]' : '[NOT PROVIDED]'}
Email: ${contactData.email ? '[PROVIDED]' : '[NOT PROVIDED]'}
Phone: ${contactData.phone ? '[PROVIDED]' : '[NOT PROVIDED]'}
Address: ${contactData.address ? '[PROVIDED]' : '[NOT PROVIDED]'}${contactData.opposingParty ? '\nOpposing Party: [PROVIDED]' : ''}${contactData.description ? '\nDescription: [PROVIDED]' : ''}`;
        
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
          sessionId: conversationId,
          userId: currentUserId
        },
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

      await sendMessageOverWs(contactMessage, [], {
        // Mark this as a contact form submission without storing PII in metadata
        isContactFormSubmission: true
      }, null);

      // Show success feedback
      if (import.meta.env.DEV) {
        console.log('[ContactForm] Successfully submitted contact information');
      }

      const paymentDetails = intakeResult.intake;
      const paymentRequired = paymentDetails?.paymentLinkEnabled === true;
      const clientSecret = paymentDetails?.clientSecret;
      const paymentLinkUrl = paymentDetails?.paymentLinkUrl;
      const checkoutSessionUrl = paymentDetails?.checkoutSessionUrl;
      const checkoutSessionId = paymentDetails?.checkoutSessionId;
      const hasClientSecret = typeof clientSecret === 'string' && clientSecret.trim().length > 0;
      const hasPaymentLink = typeof paymentLinkUrl === 'string' && paymentLinkUrl.trim().length > 0;
      const hasCheckoutSession = typeof checkoutSessionUrl === 'string' && checkoutSessionUrl.trim().length > 0;

      if (import.meta.env.DEV) {
        console.info('[Intake] Payment message decision', {
          paymentRequired,
          hasClientSecret,
          hasPaymentLink,
          hasCheckoutSession,
          intakeUuid: paymentDetails?.uuid,
          paymentLinkUrl,
          checkoutSessionUrl,
          clientSecretPresent: hasClientSecret,
          paymentLinkPresent: hasPaymentLink
        });
      }

      if (paymentRequired && (hasClientSecret || hasCheckoutSession || hasPaymentLink)) {
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
                metadata: {
                  paymentRequest: paymentRequestPayload,
                  paymentUrl
                }
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

          if (persistenceStatus === 'idle') {
            const message = 'Payment message could not be saved. Please retry.';
            throw new Error(message);
          }
          if (import.meta.env.DEV) {
            console.info('[Intake] Payment message enqueued', {
              paymentMessageId,
              intakeUuid: paymentDetails.uuid,
              paymentUrl
            });
          }
        }
      } else if (!paymentRequired && paymentDetails?.uuid) {
        void confirmIntakeLead(paymentDetails.uuid);
      }
    } catch (error) {
      console.error('Error submitting contact form:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit contact information');
      throw error; // Re-throw so form can handle the error state
    }
  }, [
    conversationId,
    practiceId,
    practiceSlug,
    onError,
    logDev,
    messages,
    confirmIntakeLead,
    applyServerMessages,
    sendMessageOverWs,
    updateConversationMetadata,
    currentUserId
  ]);

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
    reactionFetchRef.current.clear();
    reactionLoadedRef.current.clear();
    setMessages([]);
    setHasMoreMessages(false);
    setNextCursor(null);
    setIsLoadingMoreMessages(false);
    setMessagesReady(false);
    isLoadingMoreRef.current = false;
  }, [resetRealtimeState]);

  // Fetch messages from conversation
  const fetchMessages = useCallback(async (
    options?: {
      signal?: AbortSignal;
      targetConversationId?: string;
      cursor?: string | null;
      isLoadMore?: boolean;
    }
  ) => {
    if (!sessionReady) {
      return;
    }
    const {
      signal,
      targetConversationId,
      cursor,
      isLoadMore
    } = options ?? {};
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) {
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const params = new URLSearchParams({
        practiceId,
        limit: '50',
      });
      if (cursor) {
        params.set('cursor', cursor);
      }

      if (isLoadMore) {
        setIsLoadingMoreMessages(true);
      }

      const response = await fetch(`${getConversationMessagesEndpoint(activeConversationId)}?${params.toString()}`, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal,
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

      if (!isDisposedRef.current && activeConversationId === conversationIdRef.current) {
        if (isLoadMore) {
          applyServerMessages(data.data.messages ?? []);
        } else {
          const uiMessages = data.data.messages.map(toUIMessage);
          messageIdSetRef.current = new Set(data.data.messages.map((msg) => msg.id));
          lastSeqRef.current = data.data.messages.reduce((max, msg) => Math.max(max, msg.seq), 0);
          setMessages(prev => {
            if (uiMessages.length === 0 && prev.length > 0) {
              return prev;
            }
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages';
      onError?.(errorMessage);
    } finally {
      if (!isDisposedRef.current && isLoadMore) {
        setIsLoadingMoreMessages(false);
      }
    }
  }, [conversationId, practiceId, toUIMessage, onError, sendReadUpdate, sessionReady, applyServerMessages]);

  const loadMoreMessages = useCallback(async () => {
    if (!nextCursor || isLoadingMoreMessages || isLoadingMoreRef.current) {
      return;
    }
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
    if (!conversationIdValue || !practiceContextId) {
      return null;
    }
    if (isTempMessageId(messageId)) {
      return null;
    }
    if (reactionLoadedRef.current.has(messageId)) {
      return null;
    }

    const existingRequest = reactionFetchRef.current.get(messageId);
    if (existingRequest) {
      return existingRequest;
    }

    const requestPromise = fetchMessageReactions(
      conversationIdValue,
      messageId,
      practiceContextId
    ).then((reactions) => {
      updateMessageReactions(messageId, reactions);
      reactionLoadedRef.current.add(messageId);
      return reactions;
    }).catch((error) => {
      if (import.meta.env.DEV) {
        console.warn('[useMessageHandling] Failed to fetch reactions', error);
      }
      reactionLoadedRef.current.delete(messageId);
      return null;
    }).finally(() => {
      reactionFetchRef.current.delete(messageId);
    });

    reactionFetchRef.current.set(messageId, requestPromise);
    return requestPromise;
  }, [updateMessageReactions]);

  const toggleMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    const conversationIdValue = conversationIdRef.current;
    const practiceContextId = (practiceIdRef.current ?? '').trim();
    if (!conversationIdValue || !practiceContextId) {
      return;
    }
    if (isTempMessageId(messageId)) {
      return;
    }

    const currentMessage = messages.find((message) => message.id === messageId);
    const existingReactions = currentMessage?.reactions ?? [];
    const existingReaction = existingReactions.find((reaction) => reaction.emoji === emoji);
    const hasReacted = existingReaction?.reactedByMe ?? false;
    const optimisticReactions = getOptimisticReactions(existingReactions, emoji, !hasReacted);
    updateMessageReactions(messageId, optimisticReactions);
    reactionLoadedRef.current.add(messageId);

    try {
      const nextReactions = hasReacted
        ? await removeMessageReaction(
          conversationIdValue,
          messageId,
          practiceContextId,
          emoji
        )
        : await addMessageReaction(
          conversationIdValue,
          messageId,
          practiceContextId,
          emoji
        );
      updateMessageReactions(messageId, nextReactions);
      reactionLoadedRef.current.add(messageId);
    } catch (error) {
      updateMessageReactions(messageId, existingReactions);
      if (import.meta.env.DEV) {
        console.warn('[useMessageHandling] Failed to update reaction', error);
      }
      onError?.('Failed to update reaction.');
    }
  }, [getOptimisticReactions, messages, onError, updateMessageReactions]);

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
    setHasMoreMessages(false);
    setNextCursor(null);
    fetchMessages({ signal: controller.signal, targetConversationId });
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!conversationId || !practiceId) {
      return;
    }
    const cacheKey = getMessageCacheKey(practiceId, conversationId);
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as ChatMessageUI[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return;
      }
      const isValid = parsed.every(
        (msg) => typeof msg.id === 'string' && typeof msg.content === 'string' && typeof msg.timestamp === 'number'
      );
      if (!isValid) {
        window.localStorage.removeItem(cacheKey);
        return;
      }
      messageIdSetRef.current = new Set(parsed.map((message) => message.id));
      setMessages(parsed);
      setMessagesReady(true);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[useMessageHandling] Failed to load cached messages', error);
      }
    }
  }, [conversationId, practiceId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!conversationId || !practiceId) {
      return;
    }
    if (messages.length === 0) {
      return;
    }
    const cacheKey = getMessageCacheKey(practiceId, conversationId);
    const trimmed = messages.slice(-MESSAGE_CACHE_LIMIT);
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(trimmed));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[useMessageHandling] Failed to cache messages', error);
      }
    }
  }, [conversationId, messages, practiceId]);

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
  const processedPaymentUuidsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isAnonymous) return;

    let cancelled = false;

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

    const postPaymentConfirmation = async (uuid: string, practiceName: string) => {
      if (cancelled || !conversationId || !practiceId) {
        return;
      }
      const messageId = `system-payment-confirm-${uuid}`;
      if (processedPaymentUuidsRef.current.has(uuid) || messagesRef.current.some((m) => m.id === messageId || m.metadata?.intakePaymentUuid === uuid)) {
        return;
      }

      if (cancelled) {
        return;
      }

      // Optimistically add to prevent race conditions
      processedPaymentUuidsRef.current.add(uuid);

      try {
        if (cancelled) return;

        const persistedMessage = await postSystemMessage(conversationId, practiceId, {
          clientId: messageId,
          content: `Payment received. ${practiceName} will review your intake and follow up here shortly.`,
          metadata: {
            intakePaymentUuid: uuid,
            paymentStatus: 'succeeded'
          }
        });
        
        if (cancelled) {
          return;
        }

        if (persistedMessage) {
          applyServerMessages([persistedMessage]);
          setPaymentRetryNotice(null);
          void confirmIntakeLead(uuid);
        } else {
          throw new Error('Payment confirmation message could not be saved.');
        }
      } catch (error) {
        // Only remove if it failed to save (so it can be retried)
        // If it was cancelled but saved, we rely on the dedupe check above on next run
        processedPaymentUuidsRef.current.delete(uuid);
        
        const message = error instanceof Error ? error.message : 'Payment confirmation failed.';
        console.warn('[Intake] Failed to persist payment confirmation message', error);
        onError?.(message);
        throw error; // Re-throw to allow caller to handle retry logic
      }
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
          .then(() => {
            window.sessionStorage.removeItem(key);
          })
          .catch((error) => {
            console.warn('[Intake] Payment confirmation retry failed, keeping session key', error);
          });
      });

      pendingKeys.forEach((key) => {
        window.sessionStorage.removeItem(key);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    isAnonymous,
    confirmIntakeLead,
    conversationId,
    onError,
    practiceId,
    applyServerMessages
  ]);

  // The intake flow is now conversational and non-blocking
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
    intakeStatus: {
      step: currentStep,
      decision: intakeDecision
    }
  };
};
