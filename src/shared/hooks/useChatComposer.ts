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
import { initialIntakeState, type IntakeConversationState } from '@/shared/types/intake';
import { STREAMING_BUBBLE_PREFIX } from './useConversation';

// ─── constants ────────────────────────────────────────────────────────────────

const SESSION_READY_TIMEOUT_MS = 8_000;

// ─── types ────────────────────────────────────────────────────────────────────

export type IntakeFieldsPayload = {
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

export interface UseChatComposerOptions {
  practiceId?: string;
  practiceSlug?: string;
  conversationId?: string;
  mode?: ConversationMode | null;

  // Injected from useConversation
  messages: ChatMessageUI[];
  messagesRef: React.MutableRefObject<ChatMessageUI[]>;
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
  }>>;
  pendingStreamMessageIdRef: React.MutableRefObject<string | null>;
  orphanTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  conversationIdRef: React.MutableRefObject<string | undefined>;
  connectChatRoom: (id: string) => void;
  updateConversationMetadata: (patch: ConversationMetadata, targetId?: string) => Promise<unknown>;
  applyServerMessages: (msgs: ConversationMessage[]) => void;

  // Injected from useIntakeFlow
  applyIntakeFields: (fields: IntakeFieldsPayload) => Promise<void>;

  onError?: (error: unknown, context?: Record<string, unknown>) => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// ─── hook ─────────────────────────────────────────────────────────────────────

export const useChatComposer = ({
  practiceId,
  practiceSlug,
  conversationId,
  mode,
  messages,
  messagesRef,
  conversationMetadataRef,
  setMessages,
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
  connectChatRoom,
  updateConversationMetadata,
  applyIntakeFields,
  onError,
}: UseChatComposerOptions) => {
  const { session, isPending: sessionIsPending } = useSessionContext();
  const sessionReady = Boolean(session?.user) && !sessionIsPending;
  const currentUserId = session?.user?.id ?? null;

  const sessionReadyRef = useRef(sessionReady);
  sessionReadyRef.current = sessionReady;

  const practiceIdRef = useRef(practiceId);
  practiceIdRef.current = practiceId;

  const abortControllerRef = useRef<AbortController | null>(null);
  const intentAbortRef = useRef<AbortController | null>(null);
  const hasLoggedIntentRef = useRef(false);
  const pendingIntakeInitRef = useRef<Promise<void> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // ── streaming bubble helpers ──────────────────────────────────────────────

  const addStreamingBubble = useCallback((bubbleId: string) => {
    const bubble: ChatMessageUI = {
      id: bubbleId, role: 'assistant', content: '', isUser: false,
      timestamp: Date.now(), userId: null, reply_to_message_id: null,
      metadata: { source: 'ai' },
    };
    setMessages(prev => [...prev, bubble]);
  }, [setMessages]);

  const appendStreamingToken = useCallback((bubbleId: string, token: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === bubbleId ? { ...msg, content: msg.content + token } as ChatMessageUI : msg
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
    replyToMessageId?: string | null
  ) => {
    const effectivePracticeId = (practiceIdRef.current ?? '').trim();
    const activeConversationId = conversationIdRef.current;
    if (!effectivePracticeId) throw new Error('practiceId is required');
    if (!activeConversationId) throw new Error('conversationId is required');
    if (!content.trim()) throw new Error('Message cannot be empty.');

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
        ackTimerRef.current = null;
        pendingAckRef.current.delete(clientId);
        reject(new Error('Server acknowledgement timed out.'));
      }, ACK_TIMEOUT);
      ackTimerRef.current = timer;

      pendingAckRef.current.set(clientId, {
        resolve: (ack) => {
          if (ackTimerRef.current) {
            clearTimeout(ackTimerRef.current);
            ackTimerRef.current = null;
          }
          pendingAckRef.current.delete(clientId);
          resolve(ack);
        },
        reject: (err) => {
          if (ackTimerRef.current) {
            clearTimeout(ackTimerRef.current);
            ackTimerRef.current = null;
          }
          pendingAckRef.current.delete(clientId);
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
      if (ackTimerRef.current) {
        clearTimeout(ackTimerRef.current);
        ackTimerRef.current = null;
      }
      pendingAckRef.current.delete(clientId);
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
  }, [connectChatRoom, conversationIdRef, currentUserId, isSocketReadyRef, pendingAckRef, pendingClientMessageRef, sendFrame, setMessages, socketConversationIdRef, waitForSessionReady, waitForSocketReady]);

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
        return prev.map(m => m.id === bubbleIdToHandle ? orphanedBubble! : m);
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
    replyToMessageId?: string | null
  ) => {
    const activeMode = conversationMetadataRef.current?.mode ?? mode;
    const shouldUseAi = activeMode === 'ASK_QUESTION' || activeMode === 'REQUEST_CONSULTATION';
    const shouldClassifyIntent = activeMode === 'ASK_QUESTION';
    const hasUserMessages = messages.some(msg => msg.isUser);
    const trimmedMessage = message.trim();

    // Ensure intake state is initialized before first consultation message
    if (activeMode === 'REQUEST_CONSULTATION' && !conversationMetadataRef.current?.intakeConversationState) {
      if (pendingIntakeInitRef.current) {
        try { await pendingIntakeInitRef.current; }
        catch (err) { console.error('[useChatComposer] Failed to await pending intake init', err); }
      } else {
        const initPromise = updateConversationMetadata({ intakeConversationState: initialIntakeState });
        pendingIntakeInitRef.current = initPromise as unknown as Promise<void>;
        try { await initPromise; } finally { pendingIntakeInitRef.current = null; }
      }
    }

    try {
      await sendMessageOverWs(message, attachments, undefined, replyToMessageId ?? null);
      if (!shouldUseAi || trimmedMessage.length === 0) return;

      const resolvedPracticeId = (practiceId ?? '').trim();
      if (!resolvedPracticeId) return;

      // ── intent classification (first message only) ──────────────────────
      if (shouldClassifyIntent && !hasLoggedIntentRef.current && !hasUserMessages) {
        intentAbortRef.current?.abort();
        const intentController = new AbortController();
        intentAbortRef.current = intentController;
        const intentConversationId = conversationId;
        const intentPracticeId = resolvedPracticeId;

        try {
          const intentResponse = await fetch('/api/ai/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: intentController.signal,
            body: JSON.stringify({ conversationId, practiceId: resolvedPracticeId, message: trimmedMessage }),
          });
          if (intentResponse?.ok) {
            const intentData = await intentResponse.json() as FirstMessageIntent;
            if (intentController.signal.aborted) return;
            if (conversationIdRef.current !== intentConversationId || resolvedPracticeId !== intentPracticeId) return;
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
        ...messages
          .filter(msg => msg.role === 'user' || msg.role === 'assistant' || (msg.role === 'system' && msg.metadata?.source === 'ai'))
          .filter(msg => !msg.id.startsWith(STREAMING_BUBBLE_PREFIX))
          .map(msg => ({ role: msg.role === 'system' ? 'assistant' : msg.role, content: msg.content })),
        { role: 'user' as const, content: trimmedMessage },
      ];

      const resolvedPracticeSlug = (practiceSlug ?? '').trim() || undefined;
      const intakeSubmitted = messages.some(msg => msg.isUser && msg.metadata?.isContactFormSubmission);

      // ── streaming bubble ────────────────────────────────────────────────
      const bubbleId = `${STREAMING_BUBBLE_PREFIX}${conversationId}`;
      addStreamingBubble(bubbleId);

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const aiResponse = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
          credentials: 'include',
          signal: abortController.signal,
          body: JSON.stringify({
            conversationId, practiceId: resolvedPracticeId, practiceSlug: resolvedPracticeSlug,
            mode: activeMode, intakeSubmitted, messages: aiMessages,
          }),
        });

        if (!aiResponse.ok) {
          removeStreamingBubble(bubbleId);
          const errorData = await aiResponse.json().catch(() => ({})) as { error?: string };
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
          };
          if (aiData.intakeFields) await applyIntakeFields(aiData.intakeFields);
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
    conversationIdRef,
    conversationMetadataRef,
    messages,
    mode,
    onError,
    practiceId,
    practiceSlug,
    processSSEStream,
    removeStreamingBubble,
    sendMessageOverWs,
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
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      intentAbortRef.current?.abort();
      if (orphanTimerRef.current) clearTimeout(orphanTimerRef.current);
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    };
  }, [orphanTimerRef]);

  return {
    sendMessage,
    sendMessageOverWs,
    resetIntentTracking,
    abortControllerRef,
  };
};