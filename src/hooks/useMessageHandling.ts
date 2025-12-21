import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '../contexts/SessionContext.js';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { ContactData } from '../components/ContactForm';
import { getTokenAsync } from '../lib/tokenStorage';
import { getApiConfig, getChatMessagesEndpoint } from '../config/api';
import type { ConversationMessage } from '../types/conversation';

// Tool name to user-friendly message mapping
const TOOL_LOADING_MESSAGES: Record<string, string> = {
  'show_contact_form': 'Preparing contact form...',
  'create_matter': 'Creating your case file...',
  'request_lawyer_review': 'Requesting lawyer review...'
};
// Global interface for window API base override and debug properties
declare global {
  interface Window {
    __API_BASE__?: string;
    __DEBUG_AI_MESSAGES__?: (messages: ChatMessageUI[]) => void;
    __DEBUG_SSE_EVENTS__?: (data: unknown) => void;
    __DEBUG_SEND_MESSAGE__?: (message: string, attachments: FileAttachment[]) => void;
    __DEBUG_CONTACT_FORM__?: (contactData: ContactData | Record<string, boolean>, message: string) => void;
    __toolCalls?: unknown[];
    __conversationState?: unknown;
  }
}

// REMOVED: AI agent stream endpoint - will be replaced with user-to-user chat in future PR
// const getAgentStreamEndpoint = (): string => {
//   // AI endpoint removed - see git history for previous implementation
// };

// Define proper types for message history
interface ChatMessageHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface UseMessageHandlingOptions {
  practiceId?: string;
  conversationId?: string; // Required for user-to-user chat
  onError?: (error: string) => void;
}

/**
 * Hook that uses blawby-ai practice for all message handling
 * This is the preferred way to use message handling in components
 */
export const useMessageHandlingWithContext = ({ sessionId, conversationId, onError }: Omit<UseMessageHandlingOptions, 'practiceId'>) => {
  const { activePracticeId } = useSessionContext();
  return useMessageHandling({ practiceId: activePracticeId ?? undefined, sessionId, conversationId, onError });
};

/**
 * Legacy hook that requires practiceId parameter
 * @deprecated Use useMessageHandlingWithContext() instead
 * 
 * Note: For user-to-user chat, conversationId is required.
 * This hook will fetch messages on mount if conversationId is provided.
 */
export const useMessageHandling = ({ practiceId, conversationId, onError }: UseMessageHandlingOptions) => {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const abortControllerRef = useRef<globalThis.AbortController | null>(null);
  const isDisposedRef = useRef(false);
  const lastConversationIdRef = useRef<string | undefined>();
  
  // Debug hooks for test environment (development only)
  useEffect(() => {
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
      window.__DEBUG_AI_MESSAGES__ = (messages: ChatMessageUI[]) => {
        console.log('[TEST] Current messages:', messages.map((m) => ({ role: m.role, isUser: m.isUser, id: m.id })));
      };
      window.__DEBUG_AI_MESSAGES__?.(messages);
    }
  }, [messages]);

  // Helper function to update AI message with aiState
  const updateAIMessage = useCallback((messageId: string, updates: Partial<ChatMessageUI & { isUser: false }>) => {
    setMessages(prev => {
      const updated = prev.map(msg => 
        msg.id === messageId && !msg.isUser ? { ...msg, ...updates } as ChatMessageUI : msg
      );
      // Debug hook for test environment
      if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_AI_MESSAGES__) {
        window.__DEBUG_AI_MESSAGES__(updated);
      }
      return updated;
    });
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

  // REMOVED: AI streaming functionality - will be replaced with user-to-user chat in future PR
  // const sendMessageWithStreaming = useCallback(async (
  //   messageHistory: ChatMessageHistoryEntry[], 
  //   placeholderId: string,
  //   attachments: FileAttachment[] = []
  // ) => {
  //   // AI streaming code removed - see git history for previous implementation
  // }, [practiceId, sessionId, onError, updateAIMessage]);

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
        setMessages(prev => prev.map(m => m.id === tempMessage.id ? toUIMessage(data.data!) : m));
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
  }, [practiceId, conversationId, toUIMessage, onError]);

  // Handle contact form submission
  const handleContactFormSubmit = useCallback(async (contactData: ContactData) => {
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
        setMessages(prev => [...prev, toUIMessage(data.data!)]);
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
  }, [conversationId, toUIMessage, onError]);

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

  // Cancel any ongoing streaming request
  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Fetch messages from conversation
  const fetchMessages = useCallback(async () => {
    if (!conversationId || !practiceId) {
      return;
    }

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
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[]; hasMore: boolean; nextCursor?: string | null } };
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

      if (!isDisposedRef.current) {
        const uiMessages = data.data.messages.map(toUIMessage);
        setMessages(uiMessages);
      }
    } catch (err) {
      if (isDisposedRef.current) return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages';
      onError?.(errorMessage);
    }
  }, [conversationId, practiceId, toUIMessage, onError]);

  // Fetch messages on mount if conversationId is provided
  useEffect(() => {
    if (conversationId && practiceId) {
      fetchMessages();
    }

    return () => {
      isDisposedRef.current = true;
    };
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
  // 0 messages -> Ask Issue (location auto-detected via Cloudflare)
  // 1 message -> Show Contact Form
  // 2+ messages (after contact form submitted) -> Auth Gate
  const { session } = useSessionContext();
  // Anonymous users have a session and user object, but no email (empty string or null)
  // Check email to determine if user is anonymous vs authenticated
  const isAnonymous = !session?.user?.email || session?.user?.email.trim() === '' || session?.user?.email.startsWith('anonymous-');
  const userMessages = messages.filter(m => m.isUser);
  
  if (import.meta.env.DEV && messages.length > 0) {
    console.log('[IntakeFlow] Message analysis', {
      totalMessages: messages.length,
      userMessagesCount: userMessages.length,
      messagesWithIsUser: messages.map(m => ({ 
        id: m.id, 
        isUser: m.isUser, 
        role: m.role, 
        content: m.content.substring(0, 50),
        hasIsUserProperty: 'isUser' in m
      }))
    });
  }
  
  // Check if contact form has been submitted by looking for the submission flag
  const hasSubmittedContactForm = messages.some(m => 
    m.isUser && m.metadata?.isContactFormSubmission
  );
  
  const intakeStep = useCallback(() => {
    // Authenticated users skip intake flow
    if (!isAnonymous) return 'completed';
    
    // Allow first message to be sent without blocking
    // After first message, show contact form (which includes case details field)
    if (userMessages.length === 0) return 'ready'; // 'ready' means they can chat freely
    // After first message, show contact form (we collect case details in the form itself)
    if (userMessages.length >= 1 && !hasSubmittedContactForm) return 'contact_form';
    // Once contact form is submitted, show auth gate (but don't block chat)
    if (hasSubmittedContactForm) return 'auth_gate';
    return 'completed';
  }, [isAnonymous, userMessages.length, hasSubmittedContactForm]);

  const currentStep = intakeStep();
  
  if (import.meta.env.DEV) {
    console.log('[IntakeFlow] Step calculation', {
      isAnonymous,
      userMessagesCount: userMessages.length,
      hasSubmittedContactForm,
      currentStep,
      messagesCount: messages.length
    });
  }

  // Inject system messages based on step
  useEffect(() => {
    if (!isAnonymous) return;

    setMessages(prev => {
      // Check for existence of local system messages
      const hasWelcome = prev.some(m => m.id === 'system-welcome');
      const hasContactForm = prev.some(m => m.id === 'system-contact-form');
      const hasSubmissionConfirm = prev.some(m => m.id === 'system-submission-confirm');
      const hasAuth = prev.some(m => m.id === 'system-auth');

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

      // Contact form (present the form conversationally after first message)
      // We collect case details in the form itself, so no need for separate "issue" step
      if (currentStep === 'contact_form' || currentStep === 'auth_gate') {
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
      if (currentStep === 'auth_gate') {
        if (!hasSubmissionConfirm) {
          addMsg('system-submission-confirm', 'Perfect! I\'ve shared your information with our team. A legal professional will review your case and join this conversation soon.');
        }
        if (!hasAuth) {
          addMsg('system-auth', '💡 Tip: Sign up to save your conversation and case details for easy access later.');
        }
      }

      if (changed) {
        // Sort by timestamp - monotonic timestamps ensure stable ordering
        return newMessages.sort((a, b) => a.timestamp - b.timestamp);
      }
      
      return prev;
    });
  }, [currentStep, isAnonymous]);

  // Expose auth gate status - but don't block chat, just show the overlay as a suggestion
  // The intake flow is now conversational and non-blocking
  const showAuthGate = isAnonymous && currentStep === 'auth_gate';

  return {
    messages,
    sendMessage,
    handleContactFormSubmit,
    addMessage,
    updateMessage,
    clearMessages,
    cancelStreaming,
    intakeStatus: {
      step: currentStep,
      showAuthGate
    }
  };
}; 
