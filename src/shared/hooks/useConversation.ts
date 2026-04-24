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
import { getConversationMessagesEndpoint } from '@/config/api';
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
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';
import { quickActionDebugLog, isQuickActionDebugEnabled } from '@/shared/utils/quickActionDebug';
import { normalizeChatActions } from '@/shared/utils/chatActions';
import { useConversationTransport } from '@/shared/hooks/useConversationTransport';

// ─── constants ───────────────────────────────────────────────────────────────

const GAP_FETCH_LIMIT = 50;
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

// ─── types ────────────────────────────────────────────────────────────────────

export interface UseConversationOptions {
  enabled?: boolean;
  practiceId?: string;
  conversationId?: string;
  userId?: string | null;
  linkAnonymousConversationOnLoad?: boolean;
  onConversationMetadataUpdated?: (metadata: ConversationMetadata | null) => void;
  skipInitialFetch?: boolean;
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
  skipInitialFetch = false,
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

  // ── stable refs ───────────────────────────────────────────────────────────
  const isDisposedRef = useRef(false);
  const lastConversationIdRef = useRef<string | undefined>();
  const lastConversationLinkAttemptRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | undefined>();
  const practiceIdRef = useRef<string | undefined>();
  const conversationMetadataRef = useRef<ConversationMetadata | null>(null);
  const metadataUpdateQueueRef = useRef<Promise<Conversation | null>>(Promise.resolve(null));
  const messagesRef = useRef(messages);
  const lastSeqRef = useRef(0);
  const lastReadSeqRef = useRef(0);

  // Mark ready if no conversation exists yet (deferred creation case)
  useEffect(() => {
    if (enabled && !conversationId && !messagesReady) {
      setMessagesReady(true);
    }
  }, [enabled, conversationId, messagesReady]);

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
  const pendingEnsureConversationPromisesRef = useRef(new Map<string, Promise<string>>());

  // Reaction refs
  const reactionFetchRef = useRef(new Map<string, Promise<MessageReaction[]>>());
  const reactionLoadedRef = useRef(new Set<string>());
  const quickActionMessageDebugRef = useRef(new Map<string, string>());

  // Consult abort ref
  const consultFlowAbortRef = useRef<AbortController | null>(null);

  // Keep refs in sync
  practiceIdRef.current = practiceId;
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
    // Allow the update when an explicit conversation ID is provided alongside a
    // widget-bootstrap userId. The widget auth token (bw_token) handles auth for
    // the PATCH independently of the SessionContext resolution state; blocking
    // here causes silent no-ops on freshly-created conversations where sessionReady
    // is false because hasAnonymousWidgetContext requires conversationId to be set.
    const hasWidgetBypass = Boolean(externalUserId);
    if (!sessionReady && !hasWidgetBypass) return null;
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
  }, [applyConversationMetadata, conversationId, externalUserId, practiceId, sessionReady]);

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

  function sendReadUpdate(seq: number) {
    const activeConversationId = socketConversationIdRef.current;
    if (!activeConversationId || !isSocketReadyRef.current) return;
    if (seq <= lastReadSeqRef.current) return;
    lastReadSeqRef.current = seq;
    try {
      sendFrame({ type: 'read.update', data: { conversation_id: activeConversationId, last_read_seq: seq } });
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[useConversation] Failed to send read.update', error);
    }
  }

  // ── message mapping ────────────────────────────────────────────────────────

  const toUIMessage = useCallback((msg: ConversationMessage): ChatMessageUI => {
    const senderId = typeof msg.user_id === 'string' && msg.user_id.trim().length > 0 ? msg.user_id : null;
    const normalizedRole = msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user';
    const isUser = normalizedRole === 'user' && Boolean(senderId && currentUserId && senderId === currentUserId);
    const paymentRequest = parsePaymentRequestMetadata(msg.metadata);
    const metadataRecord = (msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata))
      ? msg.metadata as Record<string, unknown>
      : null;
    const rawActions = normalizeChatActions(metadataRecord?.actions);
    if (isQuickActionDebugEnabled()) {
      const hasActions = rawActions.length > 0;
      const hasPaymentRequest = Boolean(paymentRequest);
      if (hasActions || hasPaymentRequest) {
        const debugKey = msg.id || msg.client_id || `${msg.role}:${msg.created_at}`;
        const snapshot = JSON.stringify({
          role: normalizedRole,
          hasPaymentRequest,
          rawActions,
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
            rawActionsCount: rawActions.length,
            rawActions,
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
        const streamingBubbles = next.filter(m => typeof m.id === 'string' && m.id.startsWith(STREAMING_BUBBLE_PREFIX));
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

  const handleTransportGap = useCallback((fromSeq: number, latestSeq: number) => {
    fetchGapMessages(fromSeq, latestSeq).catch(err => {
      if (import.meta.env.DEV) console.warn('[useConversation] Gap fetch failed', err);
    });
  }, [fetchGapMessages]);

  const handleTransportResumeOk = useCallback((latestSeq: number) => {
    if (Number.isFinite(latestSeq)) {
      lastSeqRef.current = Math.max(lastSeqRef.current, latestSeq);
      lastReadSeqRef.current = Math.max(lastReadSeqRef.current, latestSeq);
    }
  }, [lastReadSeqRef, lastSeqRef]);

  const onMessageNewRef = useRef(handleMessageNew);
  const onMessageAckRef = useRef(handleMessageAck);
  const onReactionUpdateRef = useRef(handleReactionUpdate);
  const onGapRef = useRef(handleTransportGap);
  const onResumeOkRef = useRef(handleTransportResumeOk);
  const transportErrorRef = useRef(onError);
  onMessageNewRef.current = handleMessageNew;
  onMessageAckRef.current = handleMessageAck;
  onReactionUpdateRef.current = handleReactionUpdate;
  onGapRef.current = handleTransportGap;
  onResumeOkRef.current = handleTransportResumeOk;
  transportErrorRef.current = onError;

  const stableOnMessageNew = useCallback((data: Record<string, unknown>) => {
    onMessageNewRef.current(data);
  }, []);

  const stableOnMessageAck = useCallback((data: Record<string, unknown>) => {
    onMessageAckRef.current(data);
  }, []);

  const stableOnReactionUpdate = useCallback((data: Record<string, unknown>) => {
    onReactionUpdateRef.current(data);
  }, []);

  const stableOnGap = useCallback((fromSeq: number, latestSeq: number) => {
    onGapRef.current(fromSeq, latestSeq);
  }, []);

  const stableOnResumeOk = useCallback((latestSeq: number) => {
    onResumeOkRef.current(latestSeq);
  }, []);

  const stableOnError = useCallback((error: unknown) => {
    transportErrorRef.current?.(error);
  }, []);

  const transport = useConversationTransport({
    enabled,
    sessionReady,
    practiceId,
    onError: stableOnError,
    onMessageNew: stableOnMessageNew,
    onMessageAck: stableOnMessageAck,
    onReactionUpdate: stableOnReactionUpdate,
    onGap: stableOnGap,
    onResumeOk: stableOnResumeOk,
    lastSeqRef,
    lastReadSeqRef,
    pendingAckRef,
  });
  const {
    isSocketReady,
    sendFrame,
    waitForSocketReady,
    connectChatRoom,
    closeChatSocket,
    isSocketReadyRef,
    socketConversationIdRef,
    wsReadyRef,
  } = transport;

  const flushPendingAcks = useCallback((error: Error) => {
    for (const pending of pendingAckRef.current.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingAckRef.current.clear();
  }, [pendingAckRef]);

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
  }, [flushPendingAcks]);

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

  // Conversation change — full reset
  useEffect(() => {
    if (!enabled) return;
    // Clear whenever we had a conversation and the ID changes to anything different,
    // including undefined (e.g. when setupConversationId is cleared on home nav).
    if (lastConversationIdRef.current && lastConversationIdRef.current !== conversationId) {
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
    if (!skipInitialFetch) {
      fetchMessages({ signal: controller.signal });
      fetchConversationMetadata(controller.signal).catch(err => { console.warn('[useConversation] Failed to fetch metadata', err); });
    } else {
      // Locally-created conversation: nothing to fetch from the server yet.
      // Mark ready immediately so the ChatContainer renders system messages
      // that are pushed in via applyServerMessages (e.g. from handleSlimFormContinue).
      setMessagesReady(true);
    }
    connectChatRoom(conversationId);
    return () => { controller.abort(); closeChatSocket(); };
  }, [closeChatSocket, connectChatRoom, conversationId, enabled, fetchConversationMetadata, fetchMessages, isConversationLinkReady, practiceId, resetRealtimeState, sessionReady, skipInitialFetch]);

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
