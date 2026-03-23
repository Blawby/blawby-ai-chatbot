/**
 * useChatComposer
 *
 * Responsible for everything that happens when a user sends a message:
 *   1. Optimistic UI insertion (temp message bubble)
 *   2. WebSocket frame dispatch + ack resolution
 *   3. AI endpoint call (SSE streaming or JSON fallback)
 *   4. Streaming bubble lifecycle (add → append tokens → replace with real msg)
 *   5. Intent classification (first message in ASK_QUESTION mode)
 *   6. Intake state init guard (REQUEST_CONSULTATION mode)
 *
 * Deliberately has NO knowledge of intake business logic — that belongs in
 * useIntakeFlow.  It receives applyIntakeFields as a callback so the SSE
 * stream can forward structured intake data without a direct dependency.
 *
 * Dependencies injected via options so this hook is independently testable.
 */

import { useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { ChatMessageUI, FileAttachment } from '../../../worker/types';
import type { ConversationMessage, ConversationMetadata, ConversationMode, FirstMessageIntent } from '@/shared/types/conversation';
import { type IntakeFieldsPayload } from '@/shared/types/intake';
import { STREAMING_BUBBLE_PREFIX } from './useConversation';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';
import { applyConsultationPatchToMetadata, resolveConsultationState } from '@/shared/utils/consultationState';

// ─── constants ────────────────────────────────────────────────────────────────

const SESSION_READY_TIMEOUT_MS = 8_000;

// ─── types ────────────────────────────────────────────────────────────────────



export interface UseChatComposerOptions {
  practiceId?: string;
  practiceSlug?: string;
  conversationId?: string;
  ensureConversation?: () => Promise<string | null>;
  userId?: string | null;
  linkAnonymousConversationOnLoad?: boolean;
  mode?: ConversationMode | null;

  // Injected from useConversation
  messagesRef: React.MutableRefObject<ChatMessageUI[]>;
  messages: ChatMessageUI[];
  conversationMetadataRef: React.MutableRefObject<ConversationMetadata | null>;
  setMessages: (updater: (prev: ChatMessageUI[]) => ChatMessageUI[]) => void;
  sendFrame: (frame: { type: string; data: Record<string, unknown>; request_id?: string }) => void;
  sendReadUpdate: (seq: number) => void;
  waitForSocketReady: () => Promise<void>;
  isSocketReadyRef: React.MutableRefObject<boolean>;
  socketConversationIdRef: React.MutableRefObject<string | null>;
  messageIdSetRef: React.MutableRefObject<Set<string>>;
  pendingClientMessageRef: React.MutableRefObject<Map<string, string>>;
  pendingAckRef: React.MutableRefObject<Map<string, {
    resolve: (ack: { messageId: string; seq: number; serverTs: string; clientId: string }) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>>;
  pendingStreamMessageIdRef: React.MutableRefObject<string | null>;
  orphanTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  conversationIdRef: React.MutableRefObject<string | undefined>;
  pendingEnsureConversationPromiseRef: React.MutableRefObject<Promise<string> | null>;
  pendingEnsureConversationPromisesRef: React.MutableRefObject<Map<string, Promise<string>>>;
  connectChatRoom: (id: string) => void;
  updateConversationMetadata: (patch: ConversationMetadata, targetId?: string) => Promise<unknown>;
  applyServerMessages: (msgs: ConversationMessage[]) => void;

  // Injected from useIntakeFlow
  applyIntakeFields: (fields: IntakeFieldsPayload) => Promise<void>;

  onError?: (error: unknown, context?: Record<string, unknown>) => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const createClientId = (prefix = 'client'): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// ─── hook ─────────────────────────────────────────────────────────────────────

export const useChatComposer = ({
  practiceId,
  practiceSlug,
  conversationId,
  ensureConversation,
  userId: externalUserId,
  linkAnonymousConversationOnLoad = false,
  mode,
  messagesRef,
  conversationMetadataRef,
  setMessages,
  sendFrame,
  sendReadUpdate: _sendReadUpdate,
  waitForSocketReady,
  isSocketReadyRef,
  socketConversationIdRef,
  messageIdSetRef: _messageIdSetRef,
  pendingClientMessageRef,
  pendingAckRef,
  pendingStreamMessageIdRef,
  orphanTimerRef,
  conversationIdRef,
  pendingEnsureConversationPromiseRef: _pendingEnsureConversationPromiseRef,
  pendingEnsureConversationPromisesRef,
  connectChatRoom,
  updateConversationMetadata,
  applyIntakeFields,
  onError,
}: UseChatComposerOptions) => {
  const { session, isPending: sessionIsPending } = useSessionContext();
  const hasAnonymousWidgetContext = Boolean(linkAnonymousConversationOnLoad && conversationId && practiceId);
  const normalizedExternalUserId = typeof externalUserId === 'string' ? externalUserId.trim() : '';
  const externalUserIdValid = normalizedExternalUserId.length > 0;
  const sessionReady = !sessionIsPending && (Boolean(session?.user) || Boolean(externalUserIdValid && hasAnonymousWidgetContext));
  const currentUserId = externalUserIdValid ? normalizedExternalUserId : (session?.user?.id ?? null);

  const lastKnownModeRef = useRef<ConversationMode | null>(mode ?? null);
  if (mode && lastKnownModeRef.current !== mode) {
    lastKnownModeRef.current = mode;
  }

  const sessionReadyRef = useRef(sessionReady);
  sessionReadyRef.current = sessionReady;

  const practiceIdRef = useRef(practiceId);
  practiceIdRef.current = practiceId;

  const abortControllerRef = useRef<AbortController | null>(null);
  const intentAbortRef = useRef<AbortController | null>(null);
  const hasLoggedIntentRef = useRef(false);
  const defaultModePersistedConversationRef = useRef<string | null>(null);
  const pendingIntakeInitRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);

  // ── session readiness guard ───────────────────────────────────────────────

  const waitForSessionReady = useCallback(async () => {
    if (sessionReadyRef.current) return;
    if (typeof window === 'undefined') throw new Error('Chat session is not available in this environment.');
    const start = Date.now();
    while (!sessionReadyRef.current) {
      if (abortControllerRef.current?.signal.aborted) throw new Error('Session wait aborted');
      if (Date.now() - start > SESSION_READY_TIMEOUT_MS) throw new Error('Secure session is not ready yet. Please try again in a moment.');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, []);

  const ensureConversationId = useCallback(async () => {
    const existingConversationId = conversationIdRef.current?.trim();
    if (existingConversationId) return existingConversationId;

    if (!ensureConversation) return '';

    // Create context key based on practiceId and current user
    const contextKey = `${practiceIdRef.current || ''}:${currentUserId || ''}`;
    
    // Check if there's already an in-flight promise for this context
    const existingPromise = pendingEnsureConversationPromisesRef.current.get(contextKey);
    if (existingPromise) {
      return existingPromise;
    }

    // Create and cache the promise for this context
    const promise = ensureConversation().then(id => {
      // Verify context still matches before assigning to conversationIdRef
      const currentContextKey = `${practiceIdRef.current || ''}:${currentUserId || ''}`;
      if (currentContextKey === contextKey) {
        const ensuredConversationId = (id)?.trim() ?? '';
        if (ensuredConversationId) {
          conversationIdRef.current = ensuredConversationId;
        }
      }
      // Clear the cached promise after resolution
      pendingEnsureConversationPromisesRef.current.delete(contextKey);
      return id || '';
    }).catch(error => {
      // Clear the cached promise on error
      pendingEnsureConversationPromisesRef.current.delete(contextKey);
      throw error;
    });

    pendingEnsureConversationPromisesRef.current.set(contextKey, promise);
    return promise;
  }, [conversationIdRef, ensureConversation, pendingEnsureConversationPromisesRef, currentUserId]);

  // ── streaming bubble helpers ──────────────────────────────────────────────

  const addStreamingBubble = useCallback((bubbleId: string) => {
    const bubble: ChatMessageUI = {
      id: bubbleId, role: 'assistant', content: '', isUser: false,
      timestamp: Date.now(), userId: null, reply_to_message_id: null,
      metadata: { source: 'ai', __client_id: bubbleId },
      isLoading: true,
    };
    // Upsert to avoid duplicate streaming bubbles when a prior SSE turn left a stale bubble behind.
    setMessages(prev => [...prev.filter(msg => msg.id !== bubbleId), bubble]);
  }, [setMessages]);

  const appendStreamingToken = useCallback((bubbleId: string, token: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === bubbleId ? { ...msg, content: msg.content + token, isLoading: false } as ChatMessageUI : msg
    ));
  }, [setMessages]);

  const removeStreamingBubble = useCallback((bubbleId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== bubbleId));
  }, [setMessages]);

  // ── low-level WS send ─────────────────────────────────────────────────────

  /**
   * Send a user message over WebSocket with optimistic UI insertion.
   * Returns an ack promise so the caller can await server confirmation.
   */
  const sendMessageOverWs = useCallback(async (
    content: string,
    attachments: FileAttachment[],
    metadata?: Record<string, unknown> | null,
    replyToMessageId?: string | null,
    conversationId?: string | null
  ) => {
    if (!content.trim()) throw new Error('Message cannot be empty.');
    
    const effectivePracticeId = (practiceIdRef.current ?? '').trim();
    const activeConversationId = conversationId?.trim() || await ensureConversationId();
    if (!effectivePracticeId) throw new Error('practiceId is required');
    if (!activeConversationId) throw new Error('conversationId is required');

    const clientId = createClientId();
    const tempId = `temp-${clientId}`;

    // Optimistic insert
    const tempMessage: ChatMessageUI = {
      id: tempId, content, isUser: true, role: 'user',
      timestamp: Date.now(), userId: currentUserId,
      reply_to_message_id: replyToMessageId ?? null,
      metadata: { ...(metadata || {}), __client_id: clientId },
      files: attachments,
    };
    setMessages(prev => [...prev, tempMessage]);
    pendingClientMessageRef.current.set(clientId, tempId);

    const ACK_TIMEOUT = 10000;
    const ackPromise = new Promise<{ messageId: string; seq: number; serverTs: string; clientId: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = pendingAckRef.current.get(clientId);
        if (pending) {
          pendingAckRef.current.delete(clientId);
          reject(new Error('Server acknowledgement timed out.'));
        }
      }, ACK_TIMEOUT);

      pendingAckRef.current.set(clientId, {
        timer,
        resolve: (ack) => {
          const pending = pendingAckRef.current.get(clientId);
          if (pending) {
            clearTimeout(pending.timer);
            pendingAckRef.current.delete(clientId);
          }
          resolve(ack);
        },
        reject: (err) => {
          const pending = pendingAckRef.current.get(clientId);
          if (pending) {
            clearTimeout(pending.timer);
            pendingAckRef.current.delete(clientId);
          }
          reject(err);
        }
      });
    });

    const attachmentIds = attachments.map(att => att.id || att.storageKey || '').filter(Boolean);

    try {
      await waitForSessionReady();
      if (!isSocketReadyRef.current || socketConversationIdRef.current !== activeConversationId) {
        connectChatRoom(activeConversationId);
      }
      await waitForSocketReady();
      sendFrame({
        type: 'message.send',
        data: {
          conversation_id: activeConversationId, client_id: clientId, content,
          ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
          ...(attachmentIds.length > 0 ? { attachments: attachmentIds } : {}),
          ...(metadata ? { metadata } : {}),
        },
        request_id: clientId,
      });
    } catch (error) {
      const pending = pendingAckRef.current.get(clientId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingAckRef.current.delete(clientId);
      }
      if (!isMountedRef.current) throw error;
      pendingClientMessageRef.current.delete(clientId);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      throw error;
    }

    return ackPromise.catch(error => {
      if (!isMountedRef.current) throw error;
      pendingClientMessageRef.current.delete(clientId);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      throw error;
    });
  }, [connectChatRoom, currentUserId, ensureConversationId, isSocketReadyRef, pendingAckRef, pendingClientMessageRef, sendFrame, setMessages, socketConversationIdRef, waitForSessionReady, waitForSocketReady]);

  // ── SSE stream processor ──────────────────────────────────────────────────

  const processSSEStream = useCallback(async (
    aiResponse: Response,
    bubbleId: string,
  ) => {
    if (!aiResponse.body) { removeStreamingBubble(bubbleId); throw new Error('AI response body is null'); }
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    const processEvent = async (eventData: string) => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(eventData) as Record<string, unknown>; } catch { return; }

      if (typeof parsed.token === 'string') {
        appendStreamingToken(bubbleId, parsed.token);
        return;
      }
      if (parsed.done === true) {
        if (parsed.intakeFields && typeof parsed.intakeFields === 'object') {
          applyIntakeFields(parsed.intakeFields as IntakeFieldsPayload).catch(err => {
            console.warn('[useChatComposer] Failed to apply intake fields from stream', err);
          });
        }
        if (parsed.onboardingFields && typeof parsed.onboardingFields === 'object') {
          setMessages(prev => prev.map(msg =>
            msg.id === bubbleId
              ? { ...msg, metadata: { ...(msg.metadata ?? {}), onboardingFields: parsed.onboardingFields } }
              : msg
          ));
        }
        if (parsed.onboardingProfile && typeof parsed.onboardingProfile === 'object') {
          setMessages(prev => prev.map(msg =>
            msg.id === bubbleId
              ? { ...msg, metadata: { ...(msg.metadata ?? {}), onboardingProfile: parsed.onboardingProfile } }
              : msg
          ));
        }
        return;
      }
      if (parsed.persisted === true && typeof parsed.messageId === 'string') {
        const messageExists = messagesRef.current?.some(m => m.id === parsed.messageId);
        if (messageExists) { removeStreamingBubble(bubbleId); return; }
        pendingStreamMessageIdRef.current = parsed.messageId;
        return;
      }
      if (parsed.error === true) {
        if (isMountedRef.current) {
          removeStreamingBubble(bubbleId);
          onError?.(typeof parsed.message === 'string' ? parsed.message : 'Something went wrong. Please try again.');
        }
        return;
      }
    };

    while (true) {
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

    // Flush remainder
    if (sseBuffer.trim()) {
      const dataLine = sseBuffer.split('\n').find(line => line.startsWith('data: '));
      if (dataLine) await processEvent(dataLine.slice(6));
    }

    // Handle orphan bubble (no persisted event arrived)
    if (pendingStreamMessageIdRef.current === null) {
      const bubbleIdToHandle = bubbleId;
      let orphanedBubble: ChatMessageUI | null = null;
      const orphanExpiryMs = 30_000;

      setMessages(prev => {
        const bubble = prev.find(m => m.id === bubbleIdToHandle);
        if (!bubble || !bubble.content.trim()) return prev;
        
        orphanedBubble = {
          ...bubble,
          metadata: { ...bubble.metadata, isOrphan: true, orphanExpiryTime: Date.now() + orphanExpiryMs },
        };
        return prev.map(m => m.id === bubbleIdToHandle ? orphanedBubble : m);
      });

      if (orphanedBubble) {
        if (orphanTimerRef.current) clearTimeout(orphanTimerRef.current);
        orphanTimerRef.current = setTimeout(() => {
          setMessages(current => current.filter(m => m.id !== bubbleIdToHandle));
          orphanTimerRef.current = null;
        }, orphanExpiryMs);
      }
    }
  }, [appendStreamingToken, applyIntakeFields, messagesRef, onError, orphanTimerRef, pendingStreamMessageIdRef, removeStreamingBubble, setMessages]);

  // ── main send ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (
    message: string,
    attachments: FileAttachment[] = [],
    replyToMessageId?: string | null,
    options?: { additionalContext?: string; mentionedUserIds?: string[]; suppressAi?: boolean }
  ) => {
    try {
      if (!message.trim()) throw new Error('Message cannot be empty.');
      
      const resolvedConversationId = await ensureConversationId();
      if (!resolvedConversationId) throw new Error('conversationId is required');

      const metadataMode = conversationMetadataRef.current?.mode ?? null;
      if (metadataMode) {
        lastKnownModeRef.current = metadataMode;
      } else if (mode) {
        lastKnownModeRef.current = mode;
      }
      const activeMode = metadataMode ?? mode ?? lastKnownModeRef.current ?? null;
      const effectiveMode: ConversationMode = activeMode ?? 'ASK_QUESTION';

      // In public/widget flows the user can type before metadata mode finishes
      // syncing. Treat that first send as ASK_QUESTION and persist once.
      if (!activeMode && defaultModePersistedConversationRef.current !== resolvedConversationId) {
        defaultModePersistedConversationRef.current = resolvedConversationId;
        
        // Wait for session readiness before updating metadata
        const updateMetadata = async () => {
          await waitForSessionReady();
          const result = await updateConversationMetadata({ mode: 'ASK_QUESTION' }, resolvedConversationId);
          // If updateConversationMetadata returns null (session not ready), retry once
          if (!result) {
            await waitForSessionReady();
            await updateConversationMetadata({ mode: 'ASK_QUESTION' }, resolvedConversationId);
          }
        };
        
        void updateMetadata().catch(() => {
          defaultModePersistedConversationRef.current = null;
        });
      }

      const shouldUseAi =
        !options?.suppressAi && (
          effectiveMode === 'ASK_QUESTION' ||
          effectiveMode === 'REQUEST_CONSULTATION' ||
          effectiveMode === 'PRACTICE_ONBOARDING'
        );
      const shouldClassifyIntent = effectiveMode === 'ASK_QUESTION';
      const preSendMessages = [...messagesRef.current];
      const hasUserMessages = preSendMessages.some(msg => msg.isUser);
      const trimmedMessage = message.trim();
      const mentionUserIds = Array.from(new Set(
        (options?.mentionedUserIds ?? [])
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      ));
      const messageMetadata = mentionUserIds.length > 0
        ? {
          mentionedUserIds: mentionUserIds,
          mentionUserIds,
          mentions: mentionUserIds,
        }
        : undefined;

      // Ensure consultation state exists before first consultation message.
      if (effectiveMode === 'REQUEST_CONSULTATION' && !resolveConsultationState(conversationMetadataRef.current)) {
        if (pendingIntakeInitRef.current) {
          try { await pendingIntakeInitRef.current; }
          catch (err) { console.error('[useChatComposer] Failed to await pending intake init', err); }
        } else {
          // Wait for session readiness before initializing consultation state.
          const initIntake = async () => {
            await waitForSessionReady();
            const initialMetadata = applyConsultationPatchToMetadata(
              conversationMetadataRef.current,
              { status: 'collecting_contact', mode: 'REQUEST_CONSULTATION' },
              { mirrorLegacyFields: true }
            );
            const result = await updateConversationMetadata(initialMetadata, resolvedConversationId);
            if (!result) {
              await waitForSessionReady();
              await updateConversationMetadata(initialMetadata, resolvedConversationId);
            }
          };
          
          const initPromise = initIntake();
          pendingIntakeInitRef.current = initPromise as unknown as Promise<void>;
          try { await initPromise; } finally { pendingIntakeInitRef.current = null; }
        }
      }

      await sendMessageOverWs(message, attachments, messageMetadata, replyToMessageId ?? null, resolvedConversationId);
      if (!shouldUseAi || trimmedMessage.length === 0) return;

      const resolvedPracticeId = (practiceId ?? '').trim();
      const resolvedPracticeSlug = (practiceSlug ?? '').trim();
      if (!resolvedPracticeId) return;

      // ── intent classification (first message only) ──────────────────────
      if (shouldClassifyIntent && !hasLoggedIntentRef.current && !hasUserMessages) {
        intentAbortRef.current?.abort();
        const intentController = new AbortController();
        intentAbortRef.current = intentController;
        const intentConversationId = resolvedConversationId;
        const intentPracticeId = resolvedPracticeId;

        try {
          const intentResponse = await fetch('/api/ai/intent', {
            method: 'POST',
            headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            signal: intentController.signal,
            body: JSON.stringify({ conversationId: resolvedConversationId, practiceId: resolvedPracticeId, message: trimmedMessage }),
          });
          if (intentResponse?.ok) {
            const intentData = await intentResponse.json() as FirstMessageIntent;
            if (intentController.signal.aborted) return;
            if (conversationIdRef.current !== intentConversationId || practiceIdRef.current !== intentPracticeId) return;
            if (hasLoggedIntentRef.current) return;
            hasLoggedIntentRef.current = true;
            try { await updateConversationMetadata({ first_message_intent: intentData }, intentConversationId); }
            catch (err) { console.warn('[useChatComposer] Failed to persist intent classification', err); }
          }
        } catch (intentError) {
          if (intentError instanceof Error && intentError.name !== 'AbortError') {
            console.error('[useChatComposer] Intent classification failed:', intentError);
          }
        }
      }

      // ── AI message history ──────────────────────────────────────────────
      const aiMessages = [
        ...preSendMessages
          .filter(msg => msg.role === 'user' || msg.role === 'assistant' || (msg.role === 'system' && msg.metadata?.source === 'ai'))
          .filter(msg => !msg.id.startsWith(STREAMING_BUBBLE_PREFIX))
          .map(msg => ({ role: msg.role === 'system' ? 'assistant' : msg.role, content: msg.content })),
        { role: 'user' as const, content: trimmedMessage },
      ];

      const intakeSubmitted = preSendMessages.some(msg => msg.isUser && msg.metadata?.isContactFormSubmission);

      // ── streaming bubble ────────────────────────────────────────────────
      const streamRequestId = createClientId();
      const bubbleId = `${STREAMING_BUBBLE_PREFIX}${resolvedConversationId}-${streamRequestId}`;
      addStreamingBubble(bubbleId);

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const aiResponse = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }),
          credentials: 'include',
          signal: abortController.signal,
          body: JSON.stringify({
            conversationId: resolvedConversationId, practiceId: resolvedPracticeId,
            ...(resolvedPracticeSlug ? { practiceSlug: resolvedPracticeSlug } : {}),
            mode: effectiveMode, intakeSubmitted, messages: aiMessages,
            additionalContext: options?.additionalContext,
          }),
        });

        if (!aiResponse.ok) {
          removeStreamingBubble(bubbleId);
          const errorData = await aiResponse.json().catch(() => ({})) as {
            error?: string;
            errorCode?: string;
            details?: {
              userMessage?: string;
              [key: string]: unknown;
            } | unknown;
          };
          const recoveryMessage =
            errorData.details && typeof errorData.details === 'object' && !Array.isArray(errorData.details)
              ? (typeof (errorData.details as { userMessage?: unknown }).userMessage === 'string'
                  ? (errorData.details as { userMessage: string }).userMessage
                  : null)
              : null;
          console.error('[useChatComposer] /api/ai/chat failed', {
            status: aiResponse.status,
            statusText: aiResponse.statusText,
            payload: errorData,
            request: {
              conversationId,
              resolvedConversationId,
              practiceId: resolvedPracticeId,
              practiceSlug: resolvedPracticeSlug || null,
              mode: effectiveMode,
              intakeSubmitted,
            },
          });
          if (recoveryMessage) {
            setMessages(prev => [...prev, {
              id: createClientId('system-error'),
              role: 'assistant',
              content: recoveryMessage,
              isUser: false,
              timestamp: Date.now(),
              userId: null,
              reply_to_message_id: null,
              metadata: { source: 'system', error: true, errorCode: errorData.errorCode ?? null },
            }]);
            return;
          }
          throw new Error(errorData.error || `HTTP ${aiResponse.status}`);
        }

        const contentType = aiResponse.headers.get('content-type') ?? '';

        // JSON fallback (short-circuit replies — legal disclaimer, service list, etc.)
        if (contentType.includes('application/json')) {
          removeStreamingBubble(bubbleId);
          const aiData = await aiResponse.json() as {
            reply?: string;
            message?: ConversationMessage;
            intakeFields?: IntakeFieldsPayload | null;
            onboardingFields?: Record<string, unknown> | null;
            onboardingProfile?: Record<string, unknown> | null;
          };
          if (aiData.intakeFields) await applyIntakeFields(aiData.intakeFields);
          if (aiData.onboardingFields) {
            setMessages(prev => prev.map(msg =>
              msg.id === bubbleId
                ? { ...msg, metadata: { ...(msg.metadata ?? {}), onboardingFields: aiData.onboardingFields ?? null } }
                : msg
            ));
          }
          if (aiData.onboardingProfile) {
            setMessages(prev => prev.map(msg =>
              msg.id === bubbleId
                ? { ...msg, metadata: { ...(msg.metadata ?? {}), onboardingProfile: aiData.onboardingProfile ?? null } }
                : msg
            ));
          }
          // Let WebSocket deliver the persisted message — no local insertion needed
          if (aiData.message) return;
          const reply = (aiData.reply ?? '').trim();
          if (!reply) throw new Error('AI response missing');
          if (import.meta.env.DEV) console.warn('[useChatComposer] AI returned reply without persisted message');
          onError?.('Something went wrong. Please try again.');
          return;
        }

        // SSE streaming path
        await processSSEStream(aiResponse, bubbleId);

      } catch (streamError) {
        if (streamError instanceof Error && streamError.name === 'AbortError') return;
        removeStreamingBubble(bubbleId);
        throw streamError;
      }

    } catch (error) {
      if (!isMountedRef.current) return;
      console.error('[useChatComposer] Error sending message:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      onError?.(error instanceof Error && error.message ? error.message : 'Failed to send message. Please try again.');
    }
  }, [
    addStreamingBubble,
    applyIntakeFields,
    conversationId,
    conversationMetadataRef,
    conversationIdRef,
    ensureConversationId,
    messagesRef,
    mode,
    onError,
    practiceId,
    practiceSlug,
    processSSEStream,
    removeStreamingBubble,
    sendMessageOverWs,
    setMessages,
    updateConversationMetadata,
  ]);

  // Reset intent tracking when conversation changes
  const resetIntentTracking = useCallback(() => {
    hasLoggedIntentRef.current = false;
    intentAbortRef.current?.abort();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    const currentPendingAck = pendingAckRef.current;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      intentAbortRef.current?.abort();
      if (orphanTimerRef.current) clearTimeout(orphanTimerRef.current);
      currentPendingAck.forEach(item => {
        clearTimeout(item.timer);
      });
      currentPendingAck.clear();
    };
  }, [orphanTimerRef, pendingAckRef]);

  return {
    sendMessage,
    sendMessageOverWs,
    resetIntentTracking,
    abortControllerRef,
  };
};
