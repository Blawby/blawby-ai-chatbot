import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { ChatMessageUI, FileAttachment } from '../../../worker/types';
import { ContactData } from '@/features/intake/components/ContactForm';
import { getTokenAsync } from '@/shared/lib/tokenStorage';
import { getChatMessagesEndpoint, getIntakeConfirmEndpoint } from '@/config/api';
import { submitContactForm } from '@/shared/utils/forms';
import { buildIntakePaymentUrl } from '@/shared/utils/intakePayments';
import type { ConversationMessage, ConversationMetadata, ConversationMode, FirstMessageIntent } from '@/shared/types/conversation';
import { updateConversationMetadata as patchConversationMetadata } from '@/shared/lib/conversationApi';

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
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const abortControllerRef = useRef<globalThis.AbortController | null>(null);
  const isDisposedRef = useRef(false);
  const lastConversationIdRef = useRef<string | undefined>();
  const conversationIdRef = useRef<string | undefined>();
  const conversationMetadataRef = useRef<ConversationMetadata | null>(null);
  const hasLoggedIntentRef = useRef(false);
  const [isConsultFlowActive, setIsConsultFlowActive] = useState(false);
  
  // Debug hooks for test environment (development only)
  useEffect(() => {
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
      window.__DEBUG_AI_MESSAGES__ = (messages: ChatMessageUI[]) => {
        console.log('[TEST] Current messages:', messages.map((m) => ({ role: m.role, isUser: m.isUser, id: m.id })));
      };
      window.__DEBUG_AI_MESSAGES__?.(messages);
    }
  }, [messages]);

  const logDev = useCallback((message: string, data?: unknown) => {
    if (import.meta.env.DEV) {
      console.log(message, data);
    }
  }, []);

  const applyConversationMetadata = useCallback((metadata: ConversationMetadata | null) => {
    conversationMetadataRef.current = metadata;
    hasLoggedIntentRef.current = Boolean(metadata?.first_message_intent);
    onConversationMetadataUpdated?.(metadata);
  }, [onConversationMetadataUpdated]);

  const updateConversationMetadata = useCallback(async (
    patch: ConversationMetadata,
    targetConversationId?: string
  ) => {
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) {
      return null;
    }
    const current = conversationMetadataRef.current ?? {};
    const nextMetadata = { ...current, ...patch };
    const updated = await patchConversationMetadata(activeConversationId, practiceId, nextMetadata);
    applyConversationMetadata(updated?.user_info ?? nextMetadata);
    return updated;
  }, [applyConversationMetadata, conversationId, practiceId]);

  const fetchConversationMetadata = useCallback(async (
    signal?: AbortSignal,
    targetConversationId?: string
  ) => {
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) return;
    const token = await getTokenAsync();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(activeConversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
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
    applyConversationMetadata(data.data?.user_info ?? null);
  }, [applyConversationMetadata, conversationId, practiceId]);

  // Convert API message to UI message
  const toUIMessage = useCallback((msg: ConversationMessage): ChatMessageUI => {
    const baseMessage = {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.created_at).getTime(),
      metadata: msg.metadata || undefined,
      files: msg.metadata?.attachments ? (msg.metadata.attachments as string[]).map((fileId: string) => ({
        id: fileId,
        name: 'File',
        size: 0,
        type: 'application/octet-stream',
        url: '', // TODO: Generate file URL from file ID
      })) : undefined,
    };

    // Return properly typed variant based on role
    if (msg.role === 'user') {
      return { ...baseMessage, role: 'user', isUser: true } as ChatMessageUI;
    } else if (msg.role === 'system') {
      return { ...baseMessage, role: 'system', isUser: false } as ChatMessageUI;
    } else {
      return { ...baseMessage, role: 'assistant', isUser: false } as ChatMessageUI;
    }
  }, []);

  const persistChatMessage = useCallback(async (
    content: string,
    attachments: FileAttachment[],
    role: 'user' | 'assistant' | 'system'
  ): Promise<ConversationMessage> => {
    const effectivePracticeId = (practiceId ?? '').trim();

    if (!effectivePracticeId) {
      throw new Error('Practice ID is required. Please wait a moment and try again.');
    }

    if (!conversationId) {
      throw new Error('Conversation ID is required for sending messages.');
    }

    const token = await getTokenAsync();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const attachmentIds = attachments.map(att => att.id || att.storageKey || '').filter(Boolean);

    const response = await fetch(`${getChatMessagesEndpoint()}?practiceId=${encodeURIComponent(effectivePracticeId)}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        conversationId,
        content,
        role,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json() as { success: boolean; error?: string; data?: ConversationMessage };
    if (!data.success || !data.data) {
      throw new Error(data.error || 'Failed to send message');
    }

    return data.data;
  }, [practiceId, conversationId]);

  // Main message sending function
  const sendMessage = useCallback(async (message: string, attachments: FileAttachment[] = []) => {
    // Debug hook for test environment (development only)
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_SEND_MESSAGE__) {
      window.__DEBUG_SEND_MESSAGE__(message, attachments);
    }

    const shouldUseAi = mode === 'ASK_QUESTION';
    const hasUserMessages = messages.some((msg) => msg.isUser);
    const trimmedMessage = message.trim();

    // Optimistic update: create user message immediately
    const tempMessage: ChatMessageUI = {
      id: `temp-${Date.now()}`,
      content: message,
      isUser: true,
      role: 'user',
      timestamp: Date.now(),
      files: attachments
    };

    setMessages(prev => [...prev, tempMessage]);

    let tempAssistantId: string | null = null;
    try {
      const serverMessage = await persistChatMessage(message, attachments, 'user');
      const uiMessage = toUIMessage(serverMessage);
      logDev('[sendMessage] Converting server message to UI message', {
        serverRole: serverMessage.role,
        uiMessageRole: uiMessage.role,
        uiMessageIsUser: uiMessage.isUser,
        messageId: uiMessage.id
      });
      setMessages(prev => prev.map(m => m.id === tempMessage.id ? uiMessage : m));

      if (!shouldUseAi || trimmedMessage.length === 0) {
        return;
      }

      const resolvedPracticeSlug = (practiceSlug ?? practiceId ?? '').trim();
      if (!resolvedPracticeSlug) {
        throw new Error('Practice slug is required for AI responses');
      }

      if (!hasLoggedIntentRef.current && !hasUserMessages) {
        const intentResponse = await fetch('/api/ai/intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            conversationId,
            practiceSlug: resolvedPracticeSlug,
            message: trimmedMessage
          })
        });

        if (intentResponse.ok) {
          const intentData = await intentResponse.json() as FirstMessageIntent;
          hasLoggedIntentRef.current = true;
          try {
            await updateConversationMetadata({
              first_message_intent: intentData
            });
          } catch (intentError) {
            console.warn('[useMessageHandling] Failed to persist intent classification', intentError);
          }
        }
      }

      const aiMessages = [
        ...messages
          .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
          .map((msg) => ({
            role: msg.role,
            content: msg.content
          })),
        { role: 'user' as const, content: trimmedMessage }
      ];

      const aiResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          practiceSlug: resolvedPracticeSlug,
          messages: aiMessages
        })
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json() as { reply?: string };
      const reply = (aiData.reply ?? '').trim();
      if (!reply) {
        return;
      }

      const tempAssistant: ChatMessageUI = {
        id: `temp-ai-${Date.now()}`,
        content: reply,
        isUser: false,
        role: 'assistant',
        timestamp: Date.now()
      };
      tempAssistantId = tempAssistant.id;
      setMessages(prev => [...prev, tempAssistant]);

      const storedAssistant = await persistChatMessage(reply, [], 'assistant');
      const assistantUi = toUIMessage(storedAssistant);
      setMessages(prev => prev.map(m => m.id === tempAssistant.id ? assistantUi : m));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled by user');
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        return;
      }

      setMessages(prev => prev.filter(m => m.id !== tempMessage.id && (!tempAssistantId || m.id !== tempAssistantId)));

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
    messages,
    mode,
    practiceId,
    practiceSlug,
    conversationId,
    toUIMessage,
    onError,
    logDev,
    persistChatMessage,
    updateConversationMetadata
  ]);

  const confirmIntakeLead = useCallback(async (intakeUuid: string) => {
    if (!intakeUuid || !conversationId) return;
    const practiceContextId = (practiceId ?? practiceSlug ?? '').trim();
    if (!practiceContextId) return;

    try {
      const token = await getTokenAsync();
      if (!token) {
        console.warn('[Intake] Missing auth token for intake confirmation');
        return;
      }
      const response = await fetch(`${getIntakeConfirmEndpoint()}?practiceId=${encodeURIComponent(practiceContextId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
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
  }, [conversationId, practiceId, practiceSlug]);

  // Handle contact form submission
  const handleContactFormSubmit = useCallback(async (contactData: ContactData) => {
    logDev('[useMessageHandling] handleContactFormSubmit called with:', {
      name: !!contactData.name,
      email: !!contactData.email,
      phone: !!contactData.phone,
      location: !!contactData.location,
      opposingParty: !!contactData.opposingParty,
      description: !!contactData.description
    });
    try {
      // Format contact data as a structured message
      const contactMessage = `Contact Information:
Name: ${contactData.name}
Email: ${contactData.email}
Phone: ${contactData.phone}
Location: ${contactData.location}${contactData.opposingParty ? `\nOpposing Party: ${contactData.opposingParty}` : ''}${contactData.description ? `\nDescription: ${contactData.description}` : ''}`;

      // Debug hook for test environment (development only, PII-safe)
      if (import.meta.env.MODE === 'development' && typeof window !== 'undefined' && window.__DEBUG_CONTACT_FORM__) {
        // Create sanitized payload with presence flags instead of raw PII
        const sanitizedContactData = {
          nameProvided: !!contactData.name,
          emailProvided: !!contactData.email,
          phoneProvided: !!contactData.phone,
          locationProvided: !!contactData.location,
          opposingPartyProvided: !!contactData.opposingParty,
          descriptionProvided: !!contactData.description
        };
        
        // Create redacted contact message indicating sections without actual values
        const redactedContactMessage = `Contact Information:
Name: ${contactData.name ? '[PROVIDED]' : '[NOT PROVIDED]'}
Email: ${contactData.email ? '[PROVIDED]' : '[NOT PROVIDED]'}
Phone: ${contactData.phone ? '[PROVIDED]' : '[NOT PROVIDED]'}
Location: ${contactData.location ? '[PROVIDED]' : '[NOT PROVIDED]'}${contactData.opposingParty ? '\nOpposing Party: [PROVIDED]' : ''}${contactData.description ? '\nDescription: [PROVIDED]' : ''}`;
        
        window.__DEBUG_CONTACT_FORM__(sanitizedContactData, redactedContactMessage);
      }

      // Send the contact information as a user message with metadata flag
      // This metadata helps us detect that the contact form was submitted
      if (!conversationId) {
        throw new Error('Conversation ID is required');
      }

      const token = await getTokenAsync();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resolvedPracticeSlug = (practiceSlug ?? practiceId ?? '').trim();
      if (!resolvedPracticeSlug) {
        throw new Error('Practice slug is required to submit intake');
      }

      const intakeResult = await submitContactForm(
        {
          ...contactData,
          sessionId: conversationId
        },
        resolvedPracticeSlug
      );

      const practiceContextId = practiceId || resolvedPracticeSlug;
      const response = await fetch(`${getChatMessagesEndpoint()}?practiceId=${encodeURIComponent(practiceContextId)}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          content: contactMessage,
          metadata: {
            // Mark this as a contact form submission without storing PII in metadata
            isContactFormSubmission: true
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: ConversationMessage };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to send contact form');
      }

      // Add the message to local state
      if (!isDisposedRef.current) {
        const serverMessage = data.data;
        const uiMessage = toUIMessage(serverMessage);
        logDev('[handleContactFormSubmit] Adding contact form message to state', {
          messageId: uiMessage.id,
          role: uiMessage.role,
          isUser: uiMessage.isUser,
          hasMetadata: !!uiMessage.metadata,
          hasContactFormFlag: !!uiMessage.metadata?.isContactFormSubmission,
          serverMetadata: serverMessage.metadata,
          serverRole: serverMessage.role,
          fullServerMessage: serverMessage
        });
        setMessages(prev => {
          const updated = [...prev, uiMessage];
          logDev('[handleContactFormSubmit] Messages after adding contact form message', {
            totalMessages: updated.length,
            lastMessage: updated[updated.length - 1],
            lastMessageMetadata: updated[updated.length - 1]?.metadata
          });
          return updated;
        });
      }

      // Show success feedback
      if (import.meta.env.DEV) {
        console.log('[ContactForm] Successfully submitted contact information');
      }

      const paymentDetails = intakeResult.intake;
      const paymentRequired = paymentDetails?.paymentLinkEnabled === true;
      if (paymentRequired && paymentDetails.clientSecret) {
        const paymentMessageId = `system-payment-${paymentDetails.uuid ?? Date.now()}`;
        const paymentMessageExists = messages.some((msg) => msg.id === paymentMessageId);
        if (!paymentMessageExists) {
          const returnTo = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : undefined;
          const practiceContextId = practiceId || resolvedPracticeSlug;
          const paymentUrl = buildIntakePaymentUrl({
            intakeUuid: paymentDetails.uuid,
            clientSecret: paymentDetails.clientSecret,
            amount: paymentDetails.amount,
            currency: paymentDetails.currency,
            practiceName: paymentDetails.organizationName,
            practiceLogo: paymentDetails.organizationLogo,
            practiceSlug: resolvedPracticeSlug,
            practiceId: practiceContextId,
            conversationId,
            returnTo
          });
          setMessages(prev => {
            if (prev.some((msg) => msg.id === paymentMessageId)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: paymentMessageId,
                role: 'assistant',
                content: 'One more step: submit the consultation fee to complete your intake.',
                timestamp: Date.now(),
                isUser: false,
                paymentRequest: {
                  intakeUuid: paymentDetails.uuid,
                  clientSecret: paymentDetails.clientSecret,
                  amount: paymentDetails.amount,
                  currency: paymentDetails.currency,
                  practiceName: paymentDetails.organizationName,
                  practiceLogo: paymentDetails.organizationLogo,
                  practiceSlug: resolvedPracticeSlug,
                  practiceId: practiceContextId,
                  conversationId,
                  returnTo
                },
                metadata: {
                  paymentUrl
                }
              }
            ];
          });
        }
      } else if (!paymentRequired && paymentDetails?.uuid) {
        void confirmIntakeLead(paymentDetails.uuid);
      }
    } catch (error) {
      console.error('Error submitting contact form:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit contact information');
      throw error; // Re-throw so form can handle the error state
    }
  }, [conversationId, practiceId, practiceSlug, toUIMessage, onError, logDev, messages, confirmIntakeLead]);

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
    setMessages([]);
  }, []);

  // Fetch messages from conversation
  const fetchMessages = useCallback(async (
    signal?: AbortSignal,
    targetConversationId?: string
  ) => {
    const activeConversationId = targetConversationId ?? conversationId;
    if (!activeConversationId || !practiceId) {
      return;
    }

    try {
      const token = await getTokenAsync();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const params = new URLSearchParams({
        conversationId: activeConversationId,
        practiceId,
        limit: '50',
      });

      const response = await fetch(`${getChatMessagesEndpoint()}?${params.toString()}`, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[]; hasMore: boolean; cursor?: string | null } };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

      if (!isDisposedRef.current && activeConversationId === conversationIdRef.current) {
        const uiMessages = data.data.messages.map(toUIMessage);
        setMessages(uiMessages);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages';
      onError?.(errorMessage);
    }
  }, [conversationId, practiceId, toUIMessage, onError]);

  const startConsultFlow = useCallback((targetConversationId?: string) => {
    if (!targetConversationId || !practiceId) {
      return;
    }
    setIsConsultFlowActive(true);
    conversationIdRef.current = targetConversationId;
    fetchMessages(undefined, targetConversationId);
    fetchConversationMetadata(undefined, targetConversationId).catch((error) => {
      console.warn('[useMessageHandling] Failed to fetch conversation metadata', error);
    });
  }, [fetchConversationMetadata, fetchMessages, practiceId]);

  // Fetch messages on mount if conversationId is provided
  useEffect(() => {
    conversationIdRef.current = conversationId;
    if (conversationId && practiceId) {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      fetchMessages(controller.signal);
      fetchConversationMetadata(controller.signal).catch((error) => {
        console.warn('[useMessageHandling] Failed to fetch conversation metadata', error);
      });
    }
  }, [conversationId, practiceId, fetchMessages, fetchConversationMetadata]);

  // Clear UI state when switching to a different conversation to avoid showing stale messages
  useEffect(() => {
    if (
      lastConversationIdRef.current &&
      conversationId &&
      lastConversationIdRef.current !== conversationId
    ) {
      setMessages([]);
      setIsConsultFlowActive(false);
      applyConversationMetadata(null);
    }

    lastConversationIdRef.current = conversationId;
  }, [conversationId, applyConversationMetadata]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isDisposedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Determine intake status based on user message count (for anonymous users)
  // 0 messages -> Welcome prompt
  // 1 message -> Show Contact Form
  // After contact form -> Pending review until practice decision
  const { session } = useSessionContext();
  // Anonymous users have a session and user object, but no email (empty string or null)
  // Check email to determine if user is anonymous vs authenticated
  const isAnonymous = !session?.user?.email || session?.user?.email.trim() === '' || session?.user?.email.startsWith('anonymous-');
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
  useEffect(() => {
    if (!isAnonymous) return;

    const paymentFlags: Array<{ uuid: string; practiceName: string }> = [];
    if (typeof window !== 'undefined') {
      const paymentKeys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (key && key.startsWith('intakePaymentSuccess:')) {
          paymentKeys.push(key);
        }
      }

      paymentKeys.forEach((key) => {
        const uuid = key.split(':')[1] || 'unknown';
        let practiceName = 'the practice';
        try {
          const raw = window.sessionStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as { practiceName?: string };
            if (parsed.practiceName && parsed.practiceName.trim().length > 0) {
              practiceName = parsed.practiceName.trim();
            }
          }
        } catch (error) {
          console.warn('[Intake] Failed to parse payment success flag', error);
        }
        paymentFlags.push({ uuid, practiceName });
        window.sessionStorage.removeItem(key);
      });
    }

    paymentFlags.forEach((flag) => {
      void confirmIntakeLead(flag.uuid);
    });

    setMessages(prev => {
      // Check for existence of local system messages
      const hasWelcome = prev.some(m => m.id === 'system-welcome');
      const hasContactForm = prev.some(m => m.id === 'system-contact-form');
      const hasSubmissionConfirm = prev.some(m => m.id === 'system-submission-confirm');
      const hasModeSelector = prev.some(m => m.id === 'system-mode-selector');

      const newMessages = [...prev];
      let changed = false;

      const baseMaxTimestamp = newMessages.length > 0
        ? Math.max(...newMessages.map(m => m.timestamp))
        : Date.now();
      let tempTimestamp = baseMaxTimestamp;

      paymentFlags.forEach((flag) => {
        const messageId = `system-payment-confirm-${flag.uuid}`;
        const alreadyExists = newMessages.some((m) =>
          m.id === messageId || m.metadata?.intakePaymentUuid === flag.uuid
        );
        if (alreadyExists) {
          return;
        }

        newMessages.push({
          id: messageId,
          role: 'assistant',
          content: `Payment received. ${flag.practiceName} will review your intake and follow up here shortly.`,
          timestamp: ++tempTimestamp,
          isUser: false,
          metadata: {
            intakePaymentUuid: flag.uuid,
            paymentStatus: 'succeeded'
          }
        });
        changed = true;
      });

      // Use monotonically increasing timestamps to ensure stable ordering
      const maxTimestamp = newMessages.length > 0
        ? Math.max(...newMessages.map(m => m.timestamp))
        : Date.now();
      let nextTimestamp = maxTimestamp + 1;

      // Helper to add message if missing
      const addMsg = (id: string, content: string, metadata?: Record<string, unknown>) => {
        // Extract contactForm from metadata if present (for proper typing)
        const contactForm = metadata?.contactForm as {
          fields: string[];
          required: string[];
          message?: string;
          initialValues?: {
            name?: string;
            email?: string;
            phone?: string;
            location?: string;
            opposingParty?: string;
          };
        } | undefined;
        
        // Construct a message that strictly matches ChatMessageUI (specifically the assistant variant)
        const msg: ChatMessageUI = {
          id,
          role: 'assistant',
          content,
          timestamp: nextTimestamp++,
          isUser: false,
          metadata,
          files: undefined,
          contactForm // Set contactForm directly (not just in metadata)
        };
        newMessages.push(msg);
        changed = true;
      };

      // Welcome message on new intake threads
      if (!hasModeSelector && !hasWelcome && newMessages.length === 0) {
        addMsg(
          'system-welcome',
          "Hi! I'm Blawby AI. Share a quick summary of your case and I'll guide you to the right next step."
        );
      }

      // Contact form (present the form conversationally after first message)
      // We collect case details in the form itself, so no need for separate "issue" step
      if (isConsultFlowActive && (currentStep === 'contact_form' || currentStep === 'pending_review')) {
        if (!hasContactForm) {
          // Present the contact form with a conversational message
          addMsg('system-contact-form', 'Could you share your contact details? It will help us find the best lawyer for your case.', {
            contactForm: {
              fields: ['name', 'email', 'phone', 'location', 'opposingParty', 'description'],
              required: ['name', 'email'],
              message: undefined // Remove message from form - it's now in the main message text
            }
          });
        }
      }

      // Submission confirmation (after contact form submitted - conversational)
      if (isConsultFlowActive && currentStep === 'pending_review') {
        if (!hasSubmissionConfirm) {
          addMsg('system-submission-confirm', "Thanks! I've sent your intake to the practice. A legal professional will review it and reply here. You'll receive in-app updates as soon as there's a decision.");
        }
      }

      if (changed) {
        // Sort by timestamp - monotonic timestamps ensure stable ordering
        return newMessages.sort((a, b) => a.timestamp - b.timestamp);
      }
      
      return prev;
    });
  }, [currentStep, isAnonymous, isConsultFlowActive, confirmIntakeLead]);

  // The intake flow is now conversational and non-blocking
  return {
    messages,
    sendMessage,
    handleContactFormSubmit,
    startConsultFlow,
    addMessage,
    updateMessage,
    clearMessages,
    updateConversationMetadata,
    isConsultFlowActive,
    intakeStatus: {
      step: currentStep,
      decision: intakeDecision
    }
  };
};
