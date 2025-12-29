import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '../contexts/SessionContext.js';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { ContactData } from '../components/ContactForm';
import { getTokenAsync } from '../lib/tokenStorage';
import { getChatMessagesEndpoint } from '../config/api';
import { submitContactForm } from '../utils/forms';
import type { ConversationMessage } from '../types/conversation';

// Global interface for window API base override and debug properties
declare global {
  interface Window {
    __API_BASE__?: string;
    __DEBUG_AI_MESSAGES__?: (messages: ChatMessageUI[]) => void;
    __DEBUG_SEND_MESSAGE__?: (message: string, attachments: FileAttachment[]) => void;
    __DEBUG_CONTACT_FORM__?: (contactData: ContactData | Record<string, boolean>, message: string) => void;
  }
}

// Define proper types for message history
interface ChatMessageHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface UseMessageHandlingOptions {
  practiceId?: string;
  practiceSlug?: string;
  conversationId?: string; // Required for user-to-user chat
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
export const useMessageHandling = ({ practiceId, practiceSlug, conversationId, onError }: UseMessageHandlingOptions) => {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const abortControllerRef = useRef<globalThis.AbortController | null>(null);
  const isDisposedRef = useRef(false);
  const lastConversationIdRef = useRef<string | undefined>();
  const conversationIdRef = useRef<string | undefined>();
  
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

  // Create message history from existing messages
  const createMessageHistory = useCallback((messages: ChatMessageUI[], currentMessage?: string): ChatMessageHistoryEntry[] => {
    const history = messages.map(msg => ({
      role: (msg.isUser ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.content
    }));
    
    if (currentMessage) {
      history.push({
        role: 'user',
        content: currentMessage
      });
    }
    
    return history;
  }, []);

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

  // Main message sending function
  const sendMessage = useCallback(async (message: string, attachments: FileAttachment[] = []) => {
    // Debug hook for test environment (development only)
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_SEND_MESSAGE__) {
      window.__DEBUG_SEND_MESSAGE__(message, attachments);
    }
    
    const effectivePracticeId = (practiceId ?? '').trim();

    if (!effectivePracticeId) {
      const errorMessage = 'Practice ID is required. Please wait a moment and try again.';
      console.warn(errorMessage);
      onError?.(errorMessage);
      return;
    }

    if (!conversationId) {
      const errorMessage = 'Conversation ID is required for sending messages.';
      console.warn(errorMessage);
      onError?.(errorMessage);
      return;
    }

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
    
    try {
      const token = await getTokenAsync();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Convert file attachments to file IDs (assuming attachments have id or need to be uploaded first)
      const attachmentIds = attachments.map(att => att.id || att.storageKey || '').filter(Boolean);

      const response = await fetch(getChatMessagesEndpoint(), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          conversationId,
          content: message,
          attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
        }),
      });

      if (!response.ok) {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: ConversationMessage };
      if (!data.success || !data.data) {
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        throw new Error(data.error || 'Failed to send message');
      }

      // Replace temp message with real message from server
      if (!isDisposedRef.current) {
        const uiMessage = toUIMessage(data.data!);
        logDev('[sendMessage] Converting server message to UI message', {
          serverRole: data.data!.role,
          uiMessageRole: uiMessage.role,
          uiMessageIsUser: uiMessage.isUser,
          messageId: uiMessage.id
        });
        setMessages(prev => prev.map(m => m.id === tempMessage.id ? uiMessage : m));
      }
    } catch (error) {
      // Check if this is an AbortError (user cancelled request)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled by user');
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        return; // Don't show error message for user-initiated cancellation
      }
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
      
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
  }, [practiceId, conversationId, toUIMessage, onError, logDev]);

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

      await submitContactForm(
        {
          ...contactData,
          sessionId: conversationId
        },
        resolvedPracticeSlug
      );

      const response = await fetch(getChatMessagesEndpoint(), {
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
        const uiMessage = toUIMessage(data.data!);
        logDev('[handleContactFormSubmit] Adding contact form message to state', {
          messageId: uiMessage.id,
          role: uiMessage.role,
          isUser: uiMessage.isUser,
          hasMetadata: !!uiMessage.metadata,
          hasContactFormFlag: !!uiMessage.metadata?.isContactFormSubmission,
          serverMetadata: data.data!.metadata,
          serverRole: data.data!.role,
          fullServerMessage: data.data!
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
    } catch (error) {
      console.error('Error submitting contact form:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit contact information');
      throw error; // Re-throw so form can handle the error state
    }
  }, [conversationId, practiceId, practiceSlug, toUIMessage, onError, logDev]);

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
  const fetchMessages = useCallback(async (signal?: AbortSignal) => {
    if (!conversationId || !practiceId) {
      return;
    }

    const activeConversationId = conversationId;
    try {
      const token = await getTokenAsync();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const params = new URLSearchParams({
        conversationId,
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

      const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[]; hasMore: boolean; nextCursor?: string | null } };
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

  // Fetch messages on mount if conversationId is provided
  useEffect(() => {
    conversationIdRef.current = conversationId;
    if (conversationId && practiceId) {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      fetchMessages(controller.signal);
    }
  }, [conversationId, practiceId, fetchMessages]);

  // Clear UI state when switching to a different conversation to avoid showing stale messages
  useEffect(() => {
    if (
      lastConversationIdRef.current &&
      conversationId &&
      lastConversationIdRef.current !== conversationId
    ) {
      setMessages([]);
    }

    lastConversationIdRef.current = conversationId;
  }, [conversationId]);

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
  
  const intakeDecision = messages.find(m => {
    const decision = m.metadata?.intakeDecision;
    return decision === 'accepted' || decision === 'rejected';
  })?.metadata?.intakeDecision as 'accepted' | 'rejected' | undefined;

  const intakeStep = useCallback(() => {
    // Authenticated users skip intake flow
    if (!isAnonymous) return 'completed';

    if (intakeDecision === 'accepted') return 'accepted_needs_auth';
    if (intakeDecision === 'rejected') return 'rejected';
    
    // Allow first message to be sent without blocking
    // After first message, show contact form (which includes case details field)
    if (userMessages.length === 0) return 'ready'; // 'ready' means they can chat freely
    // After first message, show contact form (we collect case details in the form itself)
    if (userMessages.length >= 1 && !hasSubmittedContactForm) return 'contact_form';
    // Once contact form is submitted, wait for practice review
    if (hasSubmittedContactForm) return 'pending_review';
    return 'completed';
  }, [isAnonymous, intakeDecision, userMessages.length, hasSubmittedContactForm]);

  const currentStep = intakeStep();
  
  logDev('[IntakeFlow] Step calculation', {
    isAnonymous,
    userMessagesCount: userMessages.length,
    hasSubmittedContactForm,
    currentStep,
    messagesCount: messages.length
  });

  // Inject system messages based on step
  useEffect(() => {
    if (!isAnonymous) return;

    setMessages(prev => {
      // Check for existence of local system messages
      const hasWelcome = prev.some(m => m.id === 'system-welcome');
      const hasContactForm = prev.some(m => m.id === 'system-contact-form');
      const hasSubmissionConfirm = prev.some(m => m.id === 'system-submission-confirm');

      let newMessages = [...prev];
      let changed = false;
      
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
      if (!hasWelcome && newMessages.length === 0) {
        addMsg(
          'system-welcome',
          "Hi! I'm Blawby AI. Share a quick summary of your case and I'll guide you to the right next step."
        );
      }

      // Contact form (present the form conversationally after first message)
      // We collect case details in the form itself, so no need for separate "issue" step
      if (currentStep === 'contact_form' || currentStep === 'pending_review') {
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
      if (currentStep === 'pending_review') {
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
  }, [currentStep, isAnonymous]);

  // The intake flow is now conversational and non-blocking
  return {
    messages,
    sendMessage,
    handleContactFormSubmit,
    addMessage,
    updateMessage,
    clearMessages,
    intakeStatus: {
      step: currentStep,
      decision: intakeDecision
    }
  };
}; 
