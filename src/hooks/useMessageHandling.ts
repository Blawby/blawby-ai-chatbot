import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '../contexts/SessionContext.js';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { ContactData } from '../components/ContactForm';

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
  sessionId?: string;
  onError?: (error: string) => void;
}

/**
 * Hook that uses blawby-ai practice for all message handling
 * This is the preferred way to use message handling in components
 */
export const useMessageHandlingWithContext = ({ sessionId, onError }: Omit<UseMessageHandlingOptions, 'practiceId'>) => {
  const { activePracticeId } = useSessionContext();
  return useMessageHandling({ practiceId: activePracticeId ?? undefined, sessionId, onError });
};

/**
 * Legacy hook that requires practiceId parameter
 * @deprecated Use useMessageHandlingWithContext() instead
 */
export const useMessageHandling = ({ practiceId, sessionId, onError }: UseMessageHandlingOptions) => {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const abortControllerRef = useRef<globalThis.AbortController | null>(null);
  
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
    const effectiveSessionId = (sessionId ?? '').trim();

    if (!effectivePracticeId || !effectiveSessionId) {
      const errorMessage = 'Secure session is still initializing. Please wait a moment and try again.';
      console.warn(errorMessage);
      onError?.(errorMessage);
      return;
    }

    // Create user message
    const userMessage: ChatMessageUI = {
      id: crypto.randomUUID(),
      content: message,
      isUser: true,
      role: 'user',
      timestamp: Date.now(),
      files: attachments
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Add a placeholder AI message immediately that will be updated
    const placeholderId = Date.now().toString();
    const placeholderMessage: ChatMessageUI = {
      id: placeholderId,
      content: '',
      isUser: false,
      role: 'assistant',
      timestamp: Date.now(),
      isLoading: true
    };
    
    setMessages(prev => [...prev, placeholderMessage]);
    
    // Create message history from existing messages
    const messageHistory = createMessageHistory(messages, message);
    
    try {
      // REMOVED: AI streaming - will be replaced with user-to-user chat in future PR
      // For now, show a message that chat is being rebuilt
      updateAIMessage(placeholderId, { 
        content: 'Chat functionality is being rebuilt. Please check back soon.',
        isLoading: false 
      });
      // await sendMessageWithStreaming(messageHistory, placeholderId, attachments);
    } catch (error) {
      // Check if this is an AbortError (user cancelled request)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled by user');
        return; // Don't show error message for user-initiated cancellation
      }
      
      console.error('Error sending message details:', {
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        isAuthError: error instanceof Error && error.message.includes('Authentication'),
        isError10000: error instanceof Error && error.message.includes('10000')
      });
      
      // Provide better error messages for auth-related issues
      let errorMessage = error instanceof Error && error.message
        ? error.message
        : "I'm having trouble connecting to our AI service right now. Please try again in a moment, or contact us directly if the issue persists.";

      if (error instanceof Error) {
        if (error.message.includes('10000') || error.message.includes('Authentication')) {
          errorMessage = 'Please sign in to continue chatting';
        }
      }
      
      // Update placeholder with error message using the existing placeholderId
      updateAIMessage(placeholderId, { 
        content: errorMessage,
        isLoading: false 
      });
      
      onError?.(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }, [messages, practiceId, sessionId, createMessageHistory, onError, updateAIMessage]);

  // Handle contact form submission
  const handleContactFormSubmit = useCallback(async (contactData: ContactData) => {
    try {
      // Format contact data as a structured message
      const contactMessage = `Contact Information:
Name: ${contactData.name}
Email: ${contactData.email}
Phone: ${contactData.phone}
Location: ${contactData.location}${contactData.opposingParty ? `\nOpposing Party: ${contactData.opposingParty}` : ''}`;

      // Debug hook for test environment (development only, PII-safe)
      if (import.meta.env.MODE === 'development' && typeof window !== 'undefined' && window.__DEBUG_CONTACT_FORM__) {
        // Create sanitized payload with presence flags instead of raw PII
        const sanitizedContactData = {
          nameProvided: !!contactData.name,
          emailProvided: !!contactData.email,
          phoneProvided: !!contactData.phone,
          locationProvided: !!contactData.location,
          opposingPartyProvided: !!contactData.opposingParty
        };
        
        // Create redacted contact message indicating sections without actual values
        const redactedContactMessage = `Contact Information:
Name: ${contactData.name ? '[PROVIDED]' : '[NOT PROVIDED]'}
Email: ${contactData.email ? '[PROVIDED]' : '[NOT PROVIDED]'}
Phone: ${contactData.phone ? '[PROVIDED]' : '[NOT PROVIDED]'}
Location: ${contactData.location ? '[PROVIDED]' : '[NOT PROVIDED]'}${contactData.opposingParty ? '\nOpposing Party: [PROVIDED]' : ''}`;
        
        window.__DEBUG_CONTACT_FORM__(sanitizedContactData, redactedContactMessage);
      }

      // Send the contact information as a user message
      await sendMessage(contactMessage);
    } catch (error) {
      console.error('Error submitting contact form:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to submit contact information');
    }
  }, [sendMessage, onError]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    messages,
    sendMessage,
    handleContactFormSubmit,
    addMessage,
    updateMessage,
    clearMessages,
    cancelStreaming
  };
}; 
