/**
 * useConversation
 *
 * Owns the WebSocket lifecycle, initial message fetch, pagination, and
 * real-time gap recovery.  All raw transport concerns live here so that
 * useMessageHandling can stay at the orchestration level.
 *
 * Public surface
 * ──────────────
 *  messages            – ordered ChatMessageUI[]
 *  messagesReady       – true once the first fetch resolves
 *  hasMoreMessages     – pagination flag
 *  isLoadingMoreMessages
 *  isSocketReady       – live WebSocket connection flag
 *  loadMoreMessages()
 *  connectChatRoom(id) – idempotent; reconnects if needed
 *  closeChatSocket()
 *  startConsultFlow(id)
 *  ingestServerMessages(msgs) – push messages from outside (system msgs, etc.)
 *  applyServerMessages(msgs)  – primary ingest path (dedup + sort)
 *  updateConversationMetadata(patch, targetId?)
 *  conversationMetadata
 *  addMessage / updateMessage / clearMessages
 *  requestMessageReactions / toggleMessageReaction
 *  sendReadUpdate(seq)        – exposed so useChatComposer can call it
 *  messageIdSet               – ref exposed so composer can register client IDs
 *  pendingClientMessages      – ref for optimistic message tracking
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { ChatMessageUI, MessageReaction } from '../../../worker/types';
import { getConversationMessagesEndpoint, getConversationWsEndpoint } from '@/config/api';
import { getWorkerApiUrl } from '@/config/urls';
import { type IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { asMinor } from '@/shared/utils/money';
import type { Conversation, ConversationMessage, ConversationMetadata } from '@/shared/types/conversation';
import {
  updateConversationMetadata as patchConversationMetadata,
  fetchMessageReactions,
  addMessageReaction,
  removeMessageReaction,
} from '@/shared/lib/conversationApi';
import { applyConsultationPatchToMetadata, hasConsultationSignals, resolveConsultationState } from '@/shared/utils/consultationState';
import axios from 'axios';
import { linkConversationToUser } from '@/shared/lib/apiClient';
import {
  rememberConversationAnonymousParticipant,
  clearConversationAnonymousParticipant,
} from '@/shared/utils/anonymousIdentity';
import { appendWidgetTokenToUrl, withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';
import { quickActionDebugLog, isQuickActionDebugEnabled } from '@/shared/utils/quickActionDebug';

// ─── constants ───────────────────────────────────────────────────────────────

const CHAT_PROTOCOL_VERSION = 1;
const SOCKET_READY_TIMEOUT_MS = 8_000;
const GAP_FETCH_LIMIT = 50;
const MESSAGE_CACHE_LIMIT = 200;
const RECONNECT_BASE_DELAY_MS = 800;
const RECONNECT_MAX_DELAY_MS = 12_000;
const RECONNECT_MAX_ATTEMPTS = 5;
export const STREAMING_BUBBLE_PREFIX = 'streaming-';

// ─── helpers ─────────────────────────────────────────────────────────────────

const ABSOLUTE_URL_PATTERN = /^(https?:)?\/\//i;

// Cache for file URLs to avoid rebuilding them repeatedly
const fileUrlCache = new Map<string, string>();

export const buildFileUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (ABSOLUTE_URL_PATTERN.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  
  const cached = fileUrlCache.get(trimmed);
  if (cached) return cached;
  
  // Build and cache URL
  const url = `${getWorkerApiUrl()}/api/files/${encodeURIComponent(trimmed)}`;
  fileUrlCache.set(trimmed, url);
  return url;
};

const parsePaymentRequestMetadata = (metadata: unknown): IntakePaymentRequest | undefined => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const record = metadata as Record<string, unknown>;
  const metadataKeys = Object.keys(record);
  const candidate = record.paymentRequest;
  const hasPaymentRequestCandidate = Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  if (!hasPaymentRequestCandidate) return undefined;
  const data = candidate as Record<string, unknown>;
  const paymentRequestKeys = Object.keys(data);
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
  if (hasPayload) {
    quickActionDebugLog('parsePaymentRequestMetadata', {
      metadataKeys,
      hasPaymentRequestCandidate,
      paymentRequestKeys,
      parsedHasPayload: hasPayload,
    });
  }
  return hasPayload ? request : undefined;
};

export const isTempMessageId = (id: string): boolean =>
  id.startsWith('temp-') || id.startsWith('system-') || id.startsWith(STREAMING_BUBBLE_PREFIX);

const getMessageCacheKey = (practiceId: string, conversationId: string) =>
  `chat:messages:${practiceId}:${conversationId}`;

// ─── types ────────────────────────────────────────────────────────────────────

export interface UseConversationOptions {
  enabled?: boolean;
  practiceId?: string;
  conversationId?: string;
  userId?: string | null;
  linkAnonymousConversationOnLoad?: boolean;
  onConversationMetadataUpdated?: (metadata: ConversationMetadata | null) => void;
  onError?: (error: unknown, context?: Record<string, unknown>) => void;
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export const useConversation = ({
  enabled = true,
  practiceId,
  conversationId,
  userId: externalUserId,
  linkAnonymousConversationOnLoad = false,
  onConversationMetadataUpdated,
  onError,
}: UseConversationOptions) => {
  const { session, isPending: sessionIsPending, isAnonymous } = useSessionContext();
  const hasAnonymousWidgetContext = Boolean(enabled && linkAnonymousConversationOnLoad && conversationId && practiceId);
  const sessionReady = enabled && !sessionIsPending && (Boolean(session?.user) || Boolean(externalUserId && hasAnonymousWidgetContext));
  const currentUserId = externalUserId ?? session?.user?.id ?? null;

  // ── state ──────────────────────────────────────────────────────────────────
  const [isConversationLinkReady, setIsConversationLinkReady] = useState(!linkAnonymousConversationOnLoad);
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [conversationMetadata, setConversationMetadata] = useState<ConversationMetadata | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [messagesReady, setMessagesReady] = useState(false);
  const [isSocketReady, setIsSocketReady] = useState(false);

  // ── stable refs ───────────────────────────────────────────────────────────
  const isDisposedRef = useRef(false);
  const lastConversationIdRef = useRef<string | undefined>();
  const lastConversationLinkAttemptRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | undefined>();
  const practiceIdRef = useRef<string | undefined>();
  const conversationMetadataRef = useRef<ConversationMetadata | null>(null);
  const metadataUpdateQueueRef = useRef<Promise<Conversation | null>>(Promise.resolve(null));
  const sessionReadyRef = useRef(sessionReady);
  const messagesRef = useRef(messages);

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef<Promise<void> | null>(null);
  const wsReadyResolveRef = useRef<(() => void) | null>(null);
  const wsReadyRejectRef = useRef<((error: Error) => void) | null>(null);
  const socketSessionRef = useRef(0);
  const isSocketReadyRef = useRef(false);
  const lastSeqRef = useRef(0);
  const lastReadSeqRef = useRef(0);
  const socketConversationIdRef = useRef<string | null>(null);
  const isClosingSocketRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectChatRoomRef = useRef<(id: string) => void>(() => {});
  const resumeSeqResetAttemptedForRef = useRef<string | null>(null);

  // Message tracking refs — exposed so useChatComposer can share them
  /** Tracks all message IDs that have been applied to avoid duplicates */
  const messageIdSetRef = useRef(new Set<string>());
  /** Maps client_id → temp UI message ID for optimistic update resolution */
  const pendingClientMessageRef = useRef(new Map<string, string>());
  /** Maps client_id → ack promise handlers */
  const pendingAckRef = useRef(new Map<string, {
    resolve: (ack: { messageId: string; seq: number; serverTs: string; clientId: string }) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());

  // Streaming bubble refs
  const pendingStreamMessageIdRef = useRef<string | null>(null);
  const orphanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEnsureConversationPromiseRef = useRef<Promise<string> | null>(null);
  const pendingEnsureConversationPromisesRef = useRef(new Map<string, Promise<string>>());

  // Reaction refs
  const reactionFetchRef = useRef(new Map<string, Promise<MessageReaction[]>>());
  const reactionLoadedRef = useRef(new Set<string>());
  const quickActionMessageDebugRef = useRef(new Map<string, string>());

  // Consult abort ref
  const consultFlowAbortRef = useRef<AbortController | null>(null);

  // Keep refs in sync
  practiceIdRef.current = practiceId;
  sessionReadyRef.current = sessionReady;
  messagesRef.current = messages;

  useEffect(() => {
    if (!enabled) return;
    if (!conversationId || !currentUserId || !isAnonymous) return;
    rememberConversationAnonymousParticipant(conversationId, currentUserId);
  }, [conversationId, currentUserId, enabled, isAnonymous]);

  // ── anonymous conversation linking ────────────────────────────────────────

  useEffect(() => {
    if (!enabled) {
      setIsConversationLinkReady(true);
      return;
    }
    if (!conversationId || !practiceId) { setIsConversationLinkReady(true); return; }
    if (!linkAnonymousConversationOnLoad || !sessionReady || isAnonymous || !currentUserId) {
      setIsConversationLinkReady(true); return;
    }
    const attemptKey = `${practiceId}:${conversationId}:${currentUserId}`;
    if (lastConversationLinkAttemptRef.current === attemptKey) { setIsConversationLinkReady(true); return; }
    lastConversationLinkAttemptRef.current = attemptKey;
    let cancelled = false;
    setIsConversationLinkReady(false);
    (async () => {
      try {
        await linkConversationToUser(conversationId, practiceId);
        clearConversationAnonymousParticipant(conversationId);
      } catch (error) {
        console.warn('[useConversation] Conversation relink failed', { conversationId, practiceId, error });
        const is409 = axios.isAxiosError(error) && error.response?.status === 409;
        if (is409) { if (!cancelled) setIsConversationLinkReady(true); return; }
        onError?.(error instanceof Error ? error.message : 'Failed to link conversation');
      } finally {
        if (!cancelled) setIsConversationLinkReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, currentUserId, enabled, isAnonymous, linkAnonymousConversationOnLoad, practiceId, sessionReady, onError]);

  // ── metadata helpers ───────────────────────────────────────────────────────

  const applyConversationMetadata = useCallback((metadata: ConversationMetadata | null) => {
    conversationMetadataRef.current = metadata;
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
      const baseId = targetConversationId ?? activeConversationId;
      const previous = baseId === conversationId
        ? (conversationMetadataRef.current ?? {})
        : {};
      const rawNextMetadata = { ...previous, ...patch };
      const nextMetadata = (
        patch.consultation !== undefined
        || hasConsultationSignals(previous)
        || hasConsultationSignals(patch)
      )
        ? applyConsultationPatchToMetadata(rawNextMetadata, {}, { mirrorLegacyFields: true })
        : rawNextMetadata;
      applyConversationMetadata(nextMetadata);

      try {
        const updated = await patchConversationMetadata(activeConversationId, practiceKey, nextMetadata);
        applyConversationMetadata(updated?.user_info ?? nextMetadata);
        return updated;
      } catch (error) {
        applyConversationMetadata(previous);
        throw error;
      }
    };
    const queued = metadataUpdateQueueRef.current.then(runUpdate, runUpdate);
    metadataUpdateQueueRef.current = queued.catch(() => null);
    return queued;
  }, [applyConversationMetadata, conversationId, practiceId, sessionReady]);

  useEffect(() => {
    if (!enabled) return;
    if (!conversationId || !currentUserId || !isAnonymous) return;
    const existingMetadata = conversationMetadataRef.current;
    const storedParticipantId =
      (existingMetadata as Record<string, unknown> | null | undefined)?.anonParticipantId ??
      (existingMetadata as Record<string, unknown> | null | undefined)?.anon_participant_id ??
      null;
    if (storedParticipantId === currentUserId) return;
    void updateConversationMetadata({ anonParticipantId: currentUserId });
  }, [conversationId, currentUserId, enabled, isAnonymous, updateConversationMetadata]);

  const fetchConversationMetadata = useCallback(async (signal?: AbortSignal, targetConversationId?: string) => {
    if (!sessionReady) return null;
    const activeConversationId = targetConversationId ?? conversationId;
    const practiceKey = practiceId;
    if (!activeConversationId || !practiceKey) return null;
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(activeConversationId)}?practiceId=${encodeURIComponent(practiceKey)}`,
      { method: 'GET', headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'include', signal }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    const data = await response.json() as { success: boolean; data?: { user_info?: ConversationMetadata | null } };
    const metadata = data.data?.user_info ?? null;
    if (!signal?.aborted && !isDisposedRef.current && activeConversationId === conversationIdRef.current) {
      applyConversationMetadata(metadata);
    }
    return metadata;
  }, [applyConversationMetadata, conversationId, practiceId, sessionReady]);

  // ── message mapping ────────────────────────────────────────────────────────

  const toUIMessage = useCallback((msg: ConversationMessage): ChatMessageUI => {
    const senderId = typeof msg.user_id === 'string' && msg.user_id.trim().length > 0 ? msg.user_id : null;
    const normalizedRole = msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user';
    const isUser = normalizedRole === 'user' && Boolean(senderId && currentUserId && senderId === currentUserId);
    const paymentRequest = parsePaymentRequestMetadata(msg.metadata);
    const metadataRecord = (msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata))
      ? msg.metadata as Record<string, unknown>
      : null;
    const rawQuickReplies = Array.isArray(metadataRecord?.quickReplies) ? metadataRecord.quickReplies : null;
    if (isQuickActionDebugEnabled()) {
      const hasQuickReplies = (rawQuickReplies?.length ?? 0) > 0;
      const hasPaymentRequest = Boolean(paymentRequest);
      if (hasQuickReplies || hasPaymentRequest) {
        const debugKey = msg.id || msg.client_id || `${msg.role}:${msg.created_at}`;
        const snapshot = JSON.stringify({
          role: normalizedRole,
          hasPaymentRequest,
          rawQuickReplies,
          metadataKeys: metadataRecord ? Object.keys(metadataRecord) : [],
        });
        const previous = quickActionMessageDebugRef.current.get(debugKey);
        if (previous !== snapshot) {
          quickActionMessageDebugRef.current.set(debugKey, snapshot);
          quickActionDebugLog('toUIMessage mapped', {
            messageId: msg.id,
            role: normalizedRole,
            metadataKeys: metadataRecord ? Object.keys(metadataRecord) : [],
            hasPaymentRequest,
            rawQuickRepliesCount: rawQuickReplies?.length ?? 0,
            rawQuickReplies,
          });
        }
      }
    }

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
            id: fileId, name: 'File', size: 0, type: 'application/octet-stream', url: buildFileUrl(fileId),
          }))
        : undefined,
      paymentRequest,
      reactions: Array.isArray(msg.reactions)
        ? msg.reactions
            .filter((r): r is MessageReaction => r !== null && typeof r === 'object')
            .map((reaction) => ({
              emoji: typeof reaction.emoji === 'string' ? reaction.emoji : '',
              count: typeof reaction.count === 'number' ? reaction.count : 0,
              reactedByMe: Boolean(reaction.reactedByMe),
            }))
        : [],
      isUser,
      seq: msg.seq,
    };
  }, [currentUserId]);

  // ── socket ready helpers ───────────────────────────────────────────────────

  const updateSocketReady = useCallback((ready: boolean) => {
    if (isDisposedRef.current) return;
    setIsSocketReady(ready);
  }, []);

  const initSocketReadyPromise = useCallback(() => {
    const nextReadyPromise = new Promise<void>((resolve, reject) => {
      wsReadyResolveRef.current = resolve;
      wsReadyRejectRef.current = reject;
    });
    // This internal promise may be rejected during normal reconnect/close cycles
    // before any consumer awaits it. Swallow unhandled-rejection noise while
    // preserving rejection semantics for explicit awaiters.
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
  }, []);

  /** Exposed so callers (useChatComposer) can await the socket */
  const waitForSocketReady = useCallback(async () => {
    if (!wsReadyRef.current) throw new Error('Chat connection not initialized');
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<void>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Chat connection timed out')), SOCKET_READY_TIMEOUT_MS);
    });
    try { await Promise.race([wsReadyRef.current, timeoutPromise]); }
    finally { if (timeoutId) clearTimeout(timeoutId); }
  }, []);

  // ── realtime state reset ───────────────────────────────────────────────────

  const resetRealtimeState = useCallback(() => {
    flushPendingAcks(new Error('reset realtime state'));
    messageIdSetRef.current.clear();
    pendingClientMessageRef.current.clear();
    lastSeqRef.current = 0;
    lastReadSeqRef.current = 0;
    messagesRef.current = [];
    reactionLoadedRef.current.clear();
    reactionFetchRef.current.clear();
    pendingStreamMessageIdRef.current = null;
    resumeSeqResetAttemptedForRef.current = null;
  }, [flushPendingAcks]);

  // ── send frame (used by WS handlers and exposed for useChatComposer) ───────

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
    try { sendFrame({ type: 'read.update', data: { conversation_id: activeConversationId, last_read_seq: seq } }); }
    catch (error) { if (import.meta.env.DEV) console.warn('[useConversation] Failed to send read.update', error); }
  }, [sendFrame]);

  // ── core message application ───────────────────────────────────────────────

  const applyServerMessages = useCallback((incoming: ConversationMessage[]) => {
    if (incoming.length === 0 || isDisposedRef.current) return;
    let nextLatestSeq = lastSeqRef.current;
    const replacements = new Map<string, ChatMessageUI>();
    const additions: ChatMessageUI[] = [];

    for (const message of incoming) {
      if (!message?.id) continue;
      const seqValue = typeof message.seq === 'number' && Number.isFinite(message.seq) ? message.seq : null;
      if (seqValue !== null) nextLatestSeq = Math.max(nextLatestSeq, seqValue);
      if (messageIdSetRef.current.has(message.id)) continue;
      messageIdSetRef.current.add(message.id);
      const uiMessage = toUIMessage(message);
      const pendingId = pendingClientMessageRef.current.get(message.client_id);
      if (pendingId) { replacements.set(pendingId, uiMessage); pendingClientMessageRef.current.delete(message.client_id); }
      else additions.push(uiMessage);
    }

    if (replacements.size === 0 && additions.length === 0) {
      if (nextLatestSeq > lastSeqRef.current) { lastSeqRef.current = nextLatestSeq; sendReadUpdate(nextLatestSeq); }
      return;
    }
    lastSeqRef.current = nextLatestSeq;

    setMessages(prev => {
      let next = prev;
      if (replacements.size > 0) {
        next = next.map(msg => {
          const r = replacements.get(msg.id);
          if (!r) return msg;
          return { ...r, timestamp: msg.timestamp, files: r.files ?? msg.files, reactions: r.reactions ?? msg.reactions } as ChatMessageUI;
        });
      } else { next = [...next]; }

      if (additions.length > 0) {
        const pendingId = pendingStreamMessageIdRef.current;
        const streamingBubbles = next.filter(m => m.id.startsWith(STREAMING_BUBBLE_PREFIX));
        const streamingBubblesNewestFirst = [...streamingBubbles].sort((a, b) => b.timestamp - a.timestamp);
        if (streamingBubbles.length > 0) {
          const normalizeMessage = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
          const MIN_COLLAPSE_TEXT_LENGTH = 5;
          const FALLBACK_STREAM_RECENCY_WINDOW_MS = 10_000;
          const getTokenSet = (value: string): Set<string> => new Set(
            normalizeMessage(value).split(' ').filter((token) => token.length > 0)
          );
          const hasMeaningfulTokenOverlap = (left: string, right: string): boolean => {
            const leftTokens = getTokenSet(left);
            const rightTokens = getTokenSet(right);
            if (leftTokens.size === 0 || rightTokens.size === 0) return false;
            let shared = 0;
            for (const token of leftTokens) {
              if (rightTokens.has(token)) shared++;
            }
            const overlapRatio = shared / Math.min(leftTokens.size, rightTokens.size);
            return overlapRatio >= 0.5;
          };
          const canUseSubstringMatching = (left: string, right: string): boolean => (
            left.length >= MIN_COLLAPSE_TEXT_LENGTH && right.length >= MIN_COLLAPSE_TEXT_LENGTH
          );
          const assistantAdditionIndexes = additions
            .map((message, index) => ({ message, index }))
            .filter(({ message }) => (
              message.role === 'assistant'
              || (
                message.role === 'system'
                && message.metadata?.source === 'ai'
              )
            ));

          const bubbleIdsToRemove = new Set<string>();
          const usedAdditionIndexes = new Set<number>();
          const carryBubbleTimestampToAddition = (bubble: ChatMessageUI, additionIndex: number) => {
            const persisted = additions[additionIndex];
            const streamingClientId = typeof bubble.metadata?.__client_id === 'string'
              ? bubble.metadata.__client_id
              : bubble.id;
            additions[additionIndex] = {
              ...persisted,
              timestamp: bubble.timestamp,
              metadata: {
                ...(persisted.metadata ?? {}),
                __client_id: streamingClientId,
              },
            } as ChatMessageUI;
          };

          // Preferred path: explicit message-id handoff.
          if (pendingId) {
            const pendingMatchIndex = additions.findIndex((message) => message.id === pendingId);
            if (pendingMatchIndex >= 0 && streamingBubblesNewestFirst.length >= 1) {
              const bubble = streamingBubblesNewestFirst[0];
              bubbleIdsToRemove.add(bubble.id);
              carryBubbleTimestampToAddition(bubble, pendingMatchIndex);
              usedAdditionIndexes.add(pendingMatchIndex);
            }
          }

          // Content-based fallback: collapse temporary stream bubble when persisted assistant text arrives.
          if (assistantAdditionIndexes.length > 0) {
            for (const bubble of streamingBubblesNewestFirst) {
              if (bubbleIdsToRemove.has(bubble.id)) continue;
              if (typeof bubble.content !== 'string' || bubble.content.trim().length === 0) continue;
              const normalizedBubble = normalizeMessage(bubble.content);
              const matchingAssistant = assistantAdditionIndexes.find(({ message, index }) => {
                if (usedAdditionIndexes.has(index)) return false;
                if (typeof message.content !== 'string' || message.content.trim().length === 0) return false;
                const normalizedAssistant = normalizeMessage(message.content);
                if (normalizedAssistant === normalizedBubble) return true;
                if (canUseSubstringMatching(normalizedAssistant, normalizedBubble)) {
                  return normalizedAssistant.includes(normalizedBubble)
                    || normalizedBubble.includes(normalizedAssistant);
                }
                return hasMeaningfulTokenOverlap(normalizedAssistant, normalizedBubble);
              });
              if (!matchingAssistant) continue;
              bubbleIdsToRemove.add(bubble.id);
              carryBubbleTimestampToAddition(bubble, matchingAssistant.index);
              usedAdditionIndexes.add(matchingAssistant.index);
            }
          }

          // Safety fallback: if a single assistant message arrived and only stream bubbles are pending,
          // collapse the newest stream bubble to avoid duplicate assistant bubbles.
          if (bubbleIdsToRemove.size === 0 && assistantAdditionIndexes.length === 1 && streamingBubbles.length > 0) {
            const newestBubble = streamingBubblesNewestFirst[0];
            const newestBubbleContent = typeof newestBubble.content === 'string' ? normalizeMessage(newestBubble.content) : '';
            const assistantContent = typeof assistantAdditionIndexes[0].message.content === 'string'
              ? normalizeMessage(assistantAdditionIndexes[0].message.content)
              : '';
            const bubbleIsRecent = Date.now() - newestBubble.timestamp <= FALLBACK_STREAM_RECENCY_WINDOW_MS;
            const bubbleHasSimilarity = assistantContent.length >= MIN_COLLAPSE_TEXT_LENGTH
              && newestBubbleContent.length >= MIN_COLLAPSE_TEXT_LENGTH
              && (assistantContent === newestBubbleContent
                || assistantContent.includes(newestBubbleContent)
                || newestBubbleContent.includes(assistantContent)
                || hasMeaningfulTokenOverlap(assistantContent, newestBubbleContent));
            
            // Context guard: prefer same request context when present, but still allow
            // strong content matches to collapse duplicate UI bubbles.
            const bubbleClientId = typeof newestBubble.metadata?.__client_id === 'string'
              ? newestBubble.metadata.__client_id
              : newestBubble.id;
            const assistantClientId = typeof assistantAdditionIndexes[0].message.metadata?.__client_id === 'string'
              ? assistantAdditionIndexes[0].message.metadata.__client_id
              : assistantAdditionIndexes[0].message.id;
            const contextsMatch = bubbleClientId === assistantClientId;
            
            if (bubbleIsRecent && (contextsMatch || bubbleHasSimilarity)) {
              bubbleIdsToRemove.add(newestBubble.id);
              carryBubbleTimestampToAddition(newestBubble, assistantAdditionIndexes[0].index);
            }
          }

          if (bubbleIdsToRemove.size > 0) {
            pendingStreamMessageIdRef.current = null;
            if (orphanTimerRef.current !== null) {
              clearTimeout(orphanTimerRef.current);
              orphanTimerRef.current = null;
            }
            next = next.filter(m => !bubbleIdsToRemove.has(m.id));
          }
        }
        next = [...next, ...additions];
      }
      return dedupeMessagesById(next.sort((a, b) => a.timestamp - b.timestamp));
    });

    sendReadUpdate(nextLatestSeq);
  }, [sendReadUpdate, toUIMessage]);

  const ingestServerMessages = useCallback((incoming: ConversationMessage[]) => {
    applyServerMessages(incoming);
  }, [applyServerMessages]);

  // ── WS frame handlers ──────────────────────────────────────────────────────

  const handleMessageAck = useCallback((data: Record<string, unknown>) => {
    const clientId = typeof data.client_id === 'string' ? data.client_id : null;
    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const seqValue = typeof data.seq === 'number' ? data.seq : Number(data.seq);
    const serverTs = typeof data.server_ts === 'string' ? data.server_ts : null;
    if (!clientId || !messageId || !serverTs || !Number.isFinite(seqValue)) return;

    const pending = pendingAckRef.current.get(clientId);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve({ messageId, seq: seqValue, serverTs, clientId });
      pendingAckRef.current.delete(clientId);
    }
    messageIdSetRef.current.add(messageId);
    lastSeqRef.current = Math.max(lastSeqRef.current, seqValue);

    const pendingId = pendingClientMessageRef.current.get(clientId);
    if (!pendingId) { sendReadUpdate(lastSeqRef.current); return; }
    pendingClientMessageRef.current.delete(clientId);
    setMessages(prev => prev.map(msg => msg.id !== pendingId ? msg : { ...msg, id: messageId } as ChatMessageUI));
    sendReadUpdate(lastSeqRef.current);
  }, [sendReadUpdate]);

  const handleMessageNew = useCallback((data: Record<string, unknown>) => {
    const conversationIdValue = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    if (!conversationIdValue || conversationIdValue !== conversationIdRef.current) return;
    const messageId = typeof data.message_id === 'string' ? data.message_id : null;
    const clientId = typeof data.client_id === 'string' ? data.client_id : null;
    const content = typeof data.content === 'string' ? data.content : null;
    const role = typeof data.role === 'string' ? data.role : null;
    const serverTs = typeof data.server_ts === 'string' ? data.server_ts : null;
    const seqValue = typeof data.seq === 'number' ? data.seq : Number(data.seq);
    if (!messageId || !clientId || !content || !serverTs || !Number.isFinite(seqValue)) return;
    const metadata = typeof data.metadata === 'object' && data.metadata !== null && !Array.isArray(data.metadata) ? data.metadata as Record<string, unknown> : null;
    const attachments = Array.isArray(data.attachments) ? (data.attachments as string[]).filter(i => typeof i === 'string') : [];
    applyServerMessages([{
      id: messageId, conversation_id: conversationIdValue, practice_id: practiceIdRef.current ?? '',
      user_id: typeof data.user_id === 'string' ? data.user_id : '',
      role: role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user',
      content,
      reply_to_message_id: typeof data.reply_to_message_id === 'string' ? data.reply_to_message_id : null,
      metadata: metadata ?? (attachments.length > 0 ? { attachments } : null),
      client_id: clientId, seq: seqValue, server_ts: serverTs, token_count: null, created_at: serverTs,
    }]);
  }, [applyServerMessages]);

  const handleReactionUpdate = useCallback((data: Record<string, unknown>) => {
    const conversationIdValue = typeof data.conversation_id === 'string' ? data.conversation_id : null;
    if (!conversationIdValue || conversationIdValue !== conversationIdRef.current) return;
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
        const idx = existing.findIndex(r => r.emoji === emoji);
        const current = idx >= 0 ? existing[idx] : null;
        const shouldReact = action === 'add';
        const reactedByMe = actorId && currentUserId ? actorId === currentUserId ? shouldReact : current?.reactedByMe ?? false : current?.reactedByMe ?? false;
        const nextCount = count !== null ? Math.max(0, count) : Math.max(0, (current?.count ?? 0) + (shouldReact ? 1 : -1));
        if (!current && !shouldReact) return msg;
        let updated = existing;
        if (nextCount <= 0) { if (idx === -1) return msg; updated = existing.filter(r => r.emoji !== emoji); }
        else if (idx === -1) { updated = [...existing, { emoji, count: nextCount, reactedByMe }]; }
        else { updated = existing.map((r, i) => i === idx ? { ...r, count: nextCount, reactedByMe } : r); }
        if (updated === existing) return msg;
        changed = true;
        return { ...msg, reactions: updated } as ChatMessageUI;
      });
      return changed ? next : prev;
    });
  }, [currentUserId]);

  // ── gap fetch ─────────────────────────────────────────────────────────────

  const fetchGapMessages = useCallback(async (fromSeq: number, latestSeq: number) => {
    const activeConversationId = conversationIdRef.current;
    const activePracticeId = practiceIdRef.current;
    if (!activeConversationId || !activePracticeId) return;
    let nextSeq: number | null = fromSeq;
    let targetLatest = latestSeq;
    let _attempts = 0;
    let previousSeq: number | null = null;
    const MAX_NO_PROGRESS_ATTEMPTS = 3;
    let noProgressCount = 0;

    while (nextSeq !== null && nextSeq <= targetLatest) {
      if (isDisposedRef.current || conversationIdRef.current !== activeConversationId) return;
      try {
        const params = new URLSearchParams({ practiceId: activePracticeId, from_seq: String(nextSeq), limit: String(GAP_FETCH_LIMIT) });
        const response = await fetch(`${getConversationMessagesEndpoint(activeConversationId)}?${params}`, { method: 'GET', headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'include' });
        if (!response.ok) { const e = await response.json().catch(() => ({})) as { error?: string }; throw new Error(e.error || `HTTP ${response.status}`); }
        const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[]; latest_seq?: number; next_from_seq?: number | null } };
        if (!data.success || !data.data) throw new Error(data.error || 'Failed to fetch message gap');
        if (isDisposedRef.current || conversationIdRef.current !== activeConversationId) return;
        applyServerMessages(data.data.messages ?? []);
        if (typeof data.data.latest_seq === 'number') targetLatest = data.data.latest_seq;
        previousSeq = nextSeq;
        nextSeq = data.data.next_from_seq ?? null;
        
        // Check for no progress (nextSeq not advancing)
        if (nextSeq !== null && nextSeq === previousSeq) {
          noProgressCount += 1;
          if (noProgressCount >= MAX_NO_PROGRESS_ATTEMPTS) {
            onError?.('Failed to recover message gap: no progress after multiple attempts');
            return;
          }
        } else {
          noProgressCount = 0;
        }
        
        _attempts = 0;
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'Failed to recover message gap');
        throw error;
      }
    }
  }, [applyServerMessages, onError]);

  // ── reconnect ─────────────────────────────────────────────────────────────

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
  }, []);

  const scheduleReconnect = useCallback((targetConversationId: string) => {
    if (isDisposedRef.current || isClosingSocketRef.current || !sessionReadyRef.current) return;
    if (conversationIdRef.current !== targetConversationId || reconnectTimerRef.current) return;
    const nextAttempt = reconnectAttemptRef.current + 1;
    if (nextAttempt > RECONNECT_MAX_ATTEMPTS) return;
    reconnectAttemptRef.current = nextAttempt;
    const backoff = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (nextAttempt - 1), RECONNECT_MAX_DELAY_MS);
    reconnectTimerRef.current = globalThis.setTimeout(() => {
      reconnectTimerRef.current = null;
      if (isDisposedRef.current || isClosingSocketRef.current) return;
      if (!sessionReadyRef.current || conversationIdRef.current !== targetConversationId) return;
      connectChatRoomRef.current(targetConversationId);
    }, backoff + Math.floor(Math.random() * 250));
  }, []);

  // ── WebSocket connect ──────────────────────────────────────────────────────

  const connectChatRoom = useCallback((targetConversationId: string) => {
    if (!sessionReady || !targetConversationId) return;
    clearReconnectTimer();
    if (typeof WebSocket === 'undefined') { onError?.('WebSocket is not available in this environment.'); return; }
    if (wsRef.current && socketConversationIdRef.current === targetConversationId) {
      if (wsRef.current.readyState === WebSocket.CONNECTING) return;
      if (wsRef.current.readyState === WebSocket.OPEN && isSocketReadyRef.current) return;
    }

    isClosingSocketRef.current = false;
    socketSessionRef.current += 1;
    const sessionId = socketSessionRef.current;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    socketConversationIdRef.current = targetConversationId;
    initSocketReadyPromise();

    const wsUrl = appendWidgetTokenToUrl(getConversationWsEndpoint(targetConversationId));
    console.log('[WebSocket] Creating connection to', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      console.log('[WebSocket] Connection opened');
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
      ws.send(JSON.stringify({ type: 'auth', data: { protocol_version: CHAT_PROTOCOL_VERSION, client_info: { platform: 'web' } } }));
    });

    ws.addEventListener('message', (event) => {
      if (socketSessionRef.current !== sessionId || typeof event.data !== 'string') return;
      let frame: { type?: string; data?: Record<string, unknown>; request_id?: string };
      try { frame = JSON.parse(event.data) as typeof frame; } catch { return; }
      if (!frame.type || !frame.data || typeof frame.data !== 'object') return;

      switch (frame.type) {
        case 'auth.ok':
          resolveSocketReady();
          try { sendFrame({ type: 'resume', data: { conversation_id: targetConversationId, last_seq: lastSeqRef.current } }); }
          catch (err) { if (import.meta.env.DEV) console.warn('[useConversation] Failed to send resume', err); }
          return;
        case 'auth.error': {
          const msg = typeof frame.data.message === 'string' ? frame.data.message : 'Chat protocol error';
          onError?.(msg); rejectSocketReady(new Error(msg)); isClosingSocketRef.current = true; ws.close(); return;
        }
        case 'resume.ok': {
          const seq = Number(frame.data.latest_seq);
          if (Number.isFinite(seq)) { lastSeqRef.current = Math.max(lastSeqRef.current, seq); sendReadUpdate(lastSeqRef.current); }
          return;
        }
        case 'resume.gap': {
          const fromSeq = Number(frame.data.from_seq);
          const latestSeq = Number(frame.data.latest_seq);
          if (Number.isFinite(fromSeq) && Number.isFinite(latestSeq)) {
            fetchGapMessages(fromSeq, latestSeq).catch(err => { if (import.meta.env.DEV) console.warn('[useConversation] Gap fetch failed', err); });
          }
          return;
        }
        case 'message.new': handleMessageNew(frame.data); return;
        case 'message.ack': handleMessageAck(frame.data); return;
        case 'reaction.update': handleReactionUpdate(frame.data); return;
        case 'error': {
          const code = typeof frame.data.code === 'string' ? frame.data.code : null;
          const msg = typeof frame.data.message === 'string' ? frame.data.message : 'Chat error';
          const reqId = typeof frame.request_id === 'string' ? frame.request_id : null;
          if (reqId) {
            const p = pendingAckRef.current.get(reqId);
            if (p) {
              clearTimeout(p.timer);
              p.reject(new Error(msg));
              pendingAckRef.current.delete(reqId);
              // Request-scoped errors are surfaced by the sender's catch block.
              // Emitting onError here would duplicate the same toast.
              return;
            }
          }

          if (
            code === 'invalid_payload' &&
            msg === 'last_seq ahead of latest' &&
            conversationIdRef.current === targetConversationId
          ) {
            // Server no longer has the seq we attempted to resume from
            // (for example after data reconciliation). Reset local seq once
            // and reconnect without showing a user-facing toast.
            if (resumeSeqResetAttemptedForRef.current !== targetConversationId) {
              resumeSeqResetAttemptedForRef.current = targetConversationId;
              lastSeqRef.current = 0;
              lastReadSeqRef.current = 0;
              if (import.meta.env.DEV) {
                console.warn('[useConversation] Resetting resume sequence after server drift', {
                  conversationId: targetConversationId,
                });
              }
              ws.close(4000, 'resume_seq_reset');
              return;
            }
          }

          onError?.(msg); return;
        }
        default: return;
      }
    });

    ws.addEventListener('close', () => {
      console.log('[WebSocket] Connection closed');
      if (socketSessionRef.current !== sessionId) return;
      isSocketReadyRef.current = false;
      rejectSocketReady(new Error('Chat connection closed'));
      flushPendingAcks(new Error('Chat connection closed'));
      if (wsRef.current === ws) { wsRef.current = null; socketConversationIdRef.current = null; }
      if (!isClosingSocketRef.current && conversationIdRef.current === targetConversationId) scheduleReconnect(targetConversationId);
    });

    ws.addEventListener('error', (err) => { if (import.meta.env.DEV) console.warn('[useConversation] WebSocket error', err); });
  }, [clearReconnectTimer, fetchGapMessages, flushPendingAcks, handleMessageAck, handleMessageNew, handleReactionUpdate, initSocketReadyPromise, onError, rejectSocketReady, resolveSocketReady, scheduleReconnect, sendFrame, sendReadUpdate, sessionReady]);

  connectChatRoomRef.current = connectChatRoom;

  const closeChatSocket = useCallback(() => {
    isClosingSocketRef.current = true;
    isSocketReadyRef.current = false;
    rejectSocketReady(new Error('Chat connection closed'));
    flushPendingAcks(new Error('Chat connection closed'));
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    socketConversationIdRef.current = null;
  }, [clearReconnectTimer, flushPendingAcks, rejectSocketReady]);

  // ── message fetch & pagination ─────────────────────────────────────────────

  const fetchMessages = useCallback(async (options?: { signal?: AbortSignal; targetConversationId?: string; cursor?: string | null; isLoadMore?: boolean }) => {
    if (!sessionReady) return;
    const { signal, targetConversationId, cursor, isLoadMore } = options ?? {};
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) return;
    try {
      const params = new URLSearchParams({ practiceId, limit: '50' });
      params.set('source', isLoadMore ? 'chat_load_more' : 'chat_initial');
      if (cursor) params.set('cursor', cursor);
      if (isLoadMore) setIsLoadingMoreMessages(true);
      const response = await fetch(`${getConversationMessagesEndpoint(activeConversationId)}?${params}`, { method: 'GET', headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'include', signal });
      if (!response.ok) { const e = await response.json().catch(() => ({})) as { error?: string }; throw new Error(e.error || `HTTP ${response.status}`); }
      const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[]; hasMore?: boolean; cursor?: string | null } };
      if (!data.success || !data.data) throw new Error(data.error || 'Failed to fetch messages');
      if (!isDisposedRef.current && activeConversationId === conversationIdRef.current) {
        if (isLoadMore) {
          applyServerMessages(data.data.messages ?? []);
        } else {
          const fetchedMessages = data.data.messages ?? [];
          const fetchedUIMessages = fetchedMessages.map(toUIMessage);
          
          // Prepare merged set for sequence calculation outside state setter
          const mergedBeforeState = [...fetchedUIMessages, ...messagesRef.current];
          const maxSeq = mergedBeforeState.reduce((max, m) => {
            return typeof m.seq === 'number' ? Math.max(max, m.seq) : max;
          }, lastSeqRef.current);

          if (maxSeq > lastSeqRef.current) {
            lastSeqRef.current = maxSeq;
            sendReadUpdate(maxSeq);
          }

          // Update the ID set BEFORE state update to keep updater pure
          fetchedUIMessages.forEach(m => messageIdSetRef.current.add(m.id));

          setMessages(prev => {
            const existingIds = prev.reduce((set, m) => {
              set.add(m.id);
              return set;
            }, new Set<string>());
            
            const newBatch = fetchedUIMessages.filter(m => !existingIds.has(m.id));
            const merged = dedupeMessagesById([...newBatch, ...prev].sort((a, b) => a.timestamp - b.timestamp));
            
            return merged;
          });
          
          setMessagesReady(true);
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
  }, [applyServerMessages, conversationId, onError, practiceId, sendReadUpdate, sessionReady, toUIMessage]);

  const loadMoreMessages = useCallback(async () => {
    if (!nextCursor || isLoadingMoreMessages) return;
    await fetchMessages({ cursor: nextCursor, isLoadMore: true });
  }, [fetchMessages, isLoadingMoreMessages, nextCursor]);

  // ── reactions ──────────────────────────────────────────────────────────────

  const updateMessageReactions = useCallback((messageId: string, reactions: MessageReaction[]) => {
    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, reactions } as ChatMessageUI : msg));
  }, []);

  const requestMessageReactions = useCallback(async (messageId: string) => {
    const convId = conversationIdRef.current;
    const pId = (practiceIdRef.current ?? '').trim();
    if (!convId || !pId || isTempMessageId(messageId)) return null;
    if (reactionLoadedRef.current.has(messageId)) return null;
    const existing = reactionFetchRef.current.get(messageId);
    if (existing) return existing;
    const promise = fetchMessageReactions(convId, messageId, pId)
      .then(reactions => { updateMessageReactions(messageId, reactions); reactionLoadedRef.current.add(messageId); return reactions; })
      .catch(err => { if (import.meta.env.DEV) console.warn('[useConversation] Failed to fetch reactions', err); reactionLoadedRef.current.delete(messageId); return null; })
      .finally(() => { reactionFetchRef.current.delete(messageId); });
    reactionFetchRef.current.set(messageId, promise);
    return promise;
  }, [updateMessageReactions]);

  const getOptimisticReactions = useCallback((reactions: MessageReaction[], emoji: string, shouldAdd: boolean): MessageReaction[] => {
    const next = [...reactions];
    const idx = next.findIndex(r => r.emoji === emoji);
    if (idx === -1 && shouldAdd) { next.push({ emoji, count: 1, reactedByMe: true }); return next; }
    if (idx === -1) return next;
    const current = next[idx];
    const nextCount = Math.max(0, (current.count ?? 0) + (shouldAdd ? 1 : -1));
    if (!shouldAdd && nextCount === 0) { next.splice(idx, 1); return next; }
    next[idx] = { ...current, count: nextCount, reactedByMe: shouldAdd };
    return next;
  }, []);

  const toggleMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    const convId = conversationIdRef.current;
    const pId = (practiceIdRef.current ?? '').trim();
    if (!convId || !pId || isTempMessageId(messageId)) return;
    const currentMessage = messagesRef.current.find(m => m.id === messageId);
    const existingReactions = currentMessage?.reactions ?? [];
    const hasReacted = existingReactions.find(r => r.emoji === emoji)?.reactedByMe ?? false;
    updateMessageReactions(messageId, getOptimisticReactions(existingReactions, emoji, !hasReacted));
    reactionLoadedRef.current.add(messageId);
    try {
      const nextReactions = hasReacted
        ? await removeMessageReaction(convId, messageId, pId, emoji)
        : await addMessageReaction(convId, messageId, pId, emoji);
      updateMessageReactions(messageId, nextReactions);
    } catch (err) {
      updateMessageReactions(messageId, existingReactions);
      if (import.meta.env.DEV) console.warn('[useConversation] Failed to update reaction', err);
      onError?.('Failed to update reaction.');
    }
  }, [getOptimisticReactions, onError, updateMessageReactions]);

  // ── startConsultFlow ───────────────────────────────────────────────────────

  const startConsultFlow = useCallback((targetConversationId?: string) => {
    if (!sessionReady || !targetConversationId || !practiceId) return;
    const currentMetadata = targetConversationId === conversationIdRef.current
      ? conversationMetadataRef.current
      : null;
    const consultation = resolveConsultationState(currentMetadata);
    void updateConversationMetadata(
      applyConsultationPatchToMetadata(
        currentMetadata,
        {
          status: consultation?.contact ? consultation.status : 'collecting_contact',
          mode: 'REQUEST_CONSULTATION',
        },
        { mirrorLegacyFields: true }
      ),
      targetConversationId
    );
    consultFlowAbortRef.current?.abort();
    const controller = new AbortController();
    consultFlowAbortRef.current = controller;
    const isSameThread = targetConversationId === conversationIdRef.current;
    conversationIdRef.current = targetConversationId;
    if (!isSameThread) {
      setHasMoreMessages(false);
      setNextCursor(null);
      fetchMessages({ signal: controller.signal, targetConversationId });
    }
    fetchConversationMetadata(controller.signal, targetConversationId).catch(err => {
      console.warn('[useConversation] Failed to fetch conversation metadata on consult start', err);
    });
    connectChatRoom(targetConversationId);
  }, [connectChatRoom, fetchConversationMetadata, fetchMessages, practiceId, sessionReady, updateConversationMetadata]);

  // ── message CRUD helpers ───────────────────────────────────────────────────

  const dedupeMessagesById = (items: ChatMessageUI[]): ChatMessageUI[] => {
    const map = new Map<string, ChatMessageUI>();
    for (const item of items) map.set(item.id, item);
    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
  };

  const addMessage = useCallback((message: ChatMessageUI) => {
  setMessages(prev => {
    const idx = prev.findIndex(m => m.id === message.id);
    if (idx === -1) return [...prev, message];
    const next = prev.slice();
    next[idx] = message;
    return next;
  });
}, []);
  const updateMessage = useCallback((messageId: string, updates: Partial<ChatMessageUI>) => {
    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, ...updates } as ChatMessageUI : msg));
  }, []);
  const clearMessages = useCallback(() => {
    resetRealtimeState();
    reactionFetchRef.current.clear();
    reactionLoadedRef.current.clear();
    messagesRef.current = [];
    setMessages([]); setHasMoreMessages(false); setNextCursor(null);
    setIsLoadingMoreMessages(false); setMessagesReady(false);
  }, [resetRealtimeState]);

  // ── lifecycle effects ──────────────────────────────────────────────────────

  // Message cache restore
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || !conversationId || !practiceId) return;
    try {
      const raw = window.localStorage.getItem(getMessageCacheKey(practiceId, conversationId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatMessageUI[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const isValid = parsed.every(m => typeof m.id === 'string' && typeof m.content === 'string' && typeof m.timestamp === 'number');
      if (!isValid) { window.localStorage.removeItem(getMessageCacheKey(practiceId, conversationId)); return; }
      const filtered = parsed.filter(m => !m.id.startsWith(STREAMING_BUBBLE_PREFIX));
      messageIdSetRef.current = new Set(filtered.map(m => m.id));
      setMessages(filtered);
      setMessagesReady(true);
    } catch (err) { if (import.meta.env.DEV) console.warn('[useConversation] Failed to load cached messages', err); }
  }, [conversationId, enabled, practiceId]);

  // Message cache write
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || !conversationId || !practiceId || messages.length === 0) return;
    const trimmed = messages.filter(m => !m.id.startsWith(STREAMING_BUBBLE_PREFIX)).slice(-MESSAGE_CACHE_LIMIT);
    try { window.localStorage.setItem(getMessageCacheKey(practiceId, conversationId), JSON.stringify(trimmed)); }
    catch (err) { if (import.meta.env.DEV) console.warn('[useConversation] Failed to cache messages', err); }
  }, [conversationId, enabled, messages, practiceId]);

  // Conversation change — full reset
  useEffect(() => {
    if (!enabled) return;
    if (lastConversationIdRef.current && conversationId && lastConversationIdRef.current !== conversationId) {
      clearMessages(); applyConversationMetadata(null);
    }
    lastConversationIdRef.current = conversationId;
  }, [conversationId, enabled, applyConversationMetadata, clearMessages]);

  // Main lifecycle — fetch + connect
  useEffect(() => {
    if (!enabled) {
      conversationIdRef.current = undefined;
      closeChatSocket();
      return;
    }
    if (!sessionReady) { closeChatSocket(); return; }
    if (!isConversationLinkReady) { closeChatSocket(); return; }
    if (!conversationId || !practiceId) { conversationIdRef.current = undefined; closeChatSocket(); return; }
    conversationIdRef.current = conversationId;
    
    // Save cached message IDs before reset
    const cachedMessageIds = new Set(messageIdSetRef.current);
    
    resetRealtimeState();
    
    // Restore cached message IDs after reset
    if (cachedMessageIds.size > 0) {
      cachedMessageIds.forEach(id => messageIdSetRef.current.add(id));
    }
    
    const controller = new AbortController();
    setHasMoreMessages(false);
    setNextCursor(null);
    fetchMessages({ signal: controller.signal });
    fetchConversationMetadata(controller.signal).catch(err => { console.warn('[useConversation] Failed to fetch metadata', err); });
    connectChatRoom(conversationId);
    return () => { controller.abort(); closeChatSocket(); };
  }, [closeChatSocket, connectChatRoom, conversationId, enabled, fetchConversationMetadata, fetchMessages, isConversationLinkReady, practiceId, resetRealtimeState, sessionReady]);

  // Disposal
  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      consultFlowAbortRef.current?.abort();
      closeChatSocket();
    };
  }, [closeChatSocket]);

  // ── public API ─────────────────────────────────────────────────────────────

  return useMemo(() => ({
    // State
    messages,
    messagesRef,
    conversationMetadata,
    conversationMetadataRef,
    hasMoreMessages,
    isLoadingMoreMessages,
    messagesReady,
    isSocketReady,

    // Actions
    applyServerMessages,
    ingestServerMessages,
    loadMoreMessages,
    connectChatRoom,
    closeChatSocket,
    startConsultFlow,
    addMessage,
    updateMessage,
    clearMessages,
    updateConversationMetadata,
    applyConversationMetadata,
    requestMessageReactions,
    toggleMessageReaction,
    fetchConversationMetadata,

    // Low-level — needed by useChatComposer
    sendFrame,
    sendReadUpdate,
    waitForSocketReady,
    isSocketReadyRef,
    socketConversationIdRef,
    messageIdSetRef,
    pendingClientMessageRef,
    pendingAckRef,
    pendingStreamMessageIdRef,
    orphanTimerRef,
    pendingEnsureConversationPromiseRef,
    pendingEnsureConversationPromisesRef,
    conversationIdRef,
    practiceIdRef,

    // Internal for streaming bubble lifecycle
    setMessages,
  }), [
    messages,
    messagesRef,
    conversationMetadata,
    conversationMetadataRef,
    hasMoreMessages,
    isLoadingMoreMessages,
    messagesReady,
    isSocketReady,
    applyServerMessages,
    ingestServerMessages,
    loadMoreMessages,
    connectChatRoom,
    closeChatSocket,
    startConsultFlow,
    addMessage,
    updateMessage,
    clearMessages,
    updateConversationMetadata,
    applyConversationMetadata,
    requestMessageReactions,
    toggleMessageReaction,
    fetchConversationMetadata,
    sendFrame,
    sendReadUpdate,
    waitForSocketReady,
    isSocketReadyRef,
    socketConversationIdRef,
    messageIdSetRef,
    pendingClientMessageRef,
    pendingAckRef,
    pendingStreamMessageIdRef,
    orphanTimerRef,
    conversationIdRef,
    practiceIdRef,
    setMessages,
  ]);
};
