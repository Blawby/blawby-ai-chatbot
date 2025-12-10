import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useSessionContext } from '../contexts/SessionContext.js';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { ContactData } from '../components/ContactForm';
import { getTokenAsync } from '../lib/tokenStorage';
import { getApiConfig } from '../config/api';
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
  sessionId?: string;
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
export const useMessageHandling = ({ practiceId, sessionId, conversationId, onError }: UseMessageHandlingOptions) => {
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
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.created_at).getTime(),
      metadata: msg.metadata || undefined,
      isUser: msg.role === 'user',
      files: msg.metadata?.attachments ? (msg.metadata.attachments as string[]).map((fileId: string) => ({
        id: fileId,
        name: 'File',
        size: 0,
        type: 'application/octet-stream',
        url: '', // TODO: Generate file URL from file ID
      })) : undefined,
    };
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
      if (!token) {
        throw new Error('Authentication required');
      }

      // Convert file attachments to file IDs (assuming attachments have id or need to be uploaded first)
      const attachmentIds = attachments.map(att => att.id || att.storageKey || '').filter(Boolean);

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/chat/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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

  // Fetch messages from conversation
  const fetchMessages = useCallback(async () => {
    if (!conversationId || !practiceId) {
      return;
    }

    try {
      const token = await getTokenAsync();
      if (!token) {
        throw new Error('Authentication required');
      }

      const params = new URLSearchParams({
        conversationId,
        practiceId,
        limit: '50',
      });

      const config = getApiConfig();
      const response = await fetch(`${config.baseUrl}/api/chat/messages?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string; data?: { messages: ConversationMessage[]; hasMore: boolean; nextCursor: string | null } };
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
