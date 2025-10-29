import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { ChatMessageUI, FileAttachment } from '../../worker/types';
import { ContactData } from '../components/ContactForm';

// Tool name to user-friendly message mapping
const TOOL_LOADING_MESSAGES: Record<string, string> = {
  'show_contact_form': 'Preparing contact form...',
  'create_matter': 'Creating your case file...',
  'request_lawyer_review': 'Requesting lawyer review...',
  'create_payment_invoice': 'Creating payment invoice...'
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

// API endpoints - moved inline since api.ts was removed
const getAgentStreamEndpoint = (): string => {
  // Check for configurable base URL from environment or window override
  const envBaseUrl = import.meta.env.VITE_API_BASE as string | undefined;
  const windowBaseUrl = typeof window !== 'undefined' ? window.__API_BASE__ : undefined;
  const baseUrl = envBaseUrl || windowBaseUrl;
  
  if (baseUrl) {
    try {
      // Validate the base URL using URL constructor to ensure it's absolute
      new URL(baseUrl);
      return `${baseUrl}/api/agent/stream`;
    } catch (_error) {
      console.warn('Invalid base URL provided, falling back to relative path:', baseUrl);
      // Fall through to fallback logic
    }
  }
  
  // Fallback to relative path or construct from current origin
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin ? `${origin}/api/agent/stream` : '/api/agent/stream';
};

// Define proper types for message history
interface ChatMessageHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface UseMessageHandlingOptions {
  organizationId?: string;
  sessionId?: string;
  onError?: (error: string) => void;
}

/**
 * Hook that uses blawby-ai organization for all message handling
 * This is the preferred way to use message handling in components
 */
export const useMessageHandlingWithContext = ({ sessionId, onError }: Omit<UseMessageHandlingOptions, 'organizationId'>) => {
  return useMessageHandling({ organizationId: 'blawby-ai', sessionId, onError });
};

/**
 * Legacy hook that requires organizationId parameter
 * @deprecated Use useMessageHandlingWithContext() instead
 */
export const useMessageHandling = ({ organizationId, sessionId, onError }: UseMessageHandlingOptions) => {
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

  // Streaming message handler using EventSource
  const sendMessageWithStreaming = useCallback(async (
    messageHistory: ChatMessageHistoryEntry[], 
    placeholderId: string,
    attachments: FileAttachment[] = []
  ) => {
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    abortControllerRef.current = new globalThis.AbortController();
    
    const effectiveOrganizationId = (organizationId ?? '').trim();
    const effectiveSessionId = (sessionId ?? '').trim();

    if (!effectiveOrganizationId || !effectiveSessionId) {
      const errorMessage = 'Secure session is still initializing. Please wait and try again.';
      console.warn(errorMessage);
      onError?.(errorMessage);
      throw new Error(errorMessage);
    }

    const apiEndpoint = getAgentStreamEndpoint();
    
    // Create the request body
    const requestBody = {
      messages: messageHistory,
      organizationId: effectiveOrganizationId,
      sessionId: effectiveSessionId,
      attachments
    };


    try {
      // Use fetch with POST to send the request and get the stream
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal
      });

      if (response.status === 402) {
        let errorMessage = 'Monthly usage limit reached.';
        try {
          const errorJson = await response.json() as { error?: string; details?: { message?: string } };
          if (errorJson?.error) {
            errorMessage = errorJson.error;
          } else if (errorJson?.details?.message) {
            errorMessage = errorJson.details.message;
          }
        } catch {
          // ignore JSON parse failure
        }

        throw new Error(errorMessage);
      }

      if (!response.ok) {
        throw new Error(`Streaming API error: ${response.status}`);
      }

      // Get the response body as a readable stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available');
      }

      const decoder = new globalThis.TextDecoder();
      let buffer = '';
      let currentContent = '';

      try {
        let combinedData: string | undefined;
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE events (separated by double newlines)
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // Keep incomplete event in buffer
          
          for (const event of events) {
            // Collect all data lines in this event
            const dataLines = event.split('\n').filter(line => line.startsWith('data: '));
            if (dataLines.length > 0) {
              try {
                // Concatenate all data lines with newline separators
                combinedData = dataLines.map(line => line.slice(6)).join('\n');
                const data = JSON.parse(combinedData);
                
                // Validate data object structure
                if (!data || typeof data !== 'object') {
                  console.warn('Invalid SSE data: not an object', { combinedData });
                  continue;
                }
                
                // Debug hook for test environment (development only) - sanitized
                if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_SSE_EVENTS__) {
                  // Only log safe properties to avoid sensitive data exposure
                  const sanitizedData = {
                    type: data.type,
                    timestamp: Date.now(),
                    hasText: !!data.text,
                    hasToolName: !!(data.toolName || data.name),
                    hasResult: !!data.result
                  };
                  window.__DEBUG_SSE_EVENTS__(sanitizedData);
                }
                
                // Validate that we have a type property
                if (typeof data.type !== 'string') {
                  console.warn('Invalid SSE data: missing or invalid type', { type: data.type });
                  continue;
                }
                
                switch (data.type) {
                  case 'connected':
                    // Connection established, start showing thinking indicator
                    updateAIMessage(placeholderId, { 
                      content: '',
                      isLoading: true,
                      aiState: 'thinking'
                    });
                    break;
                    
                  case 'text':
                    // Add text chunk to current content
                    currentContent += data.text;
                    updateAIMessage(placeholderId, { 
                      content: currentContent,
                      isLoading: true,
                      aiState: 'generating'
                    });
                    break;
                    
                  case 'typing':
                    // Show typing indicator during tool calls
                    updateAIMessage(placeholderId, { 
                      content: `${currentContent}...`,
                      isLoading: true 
                    });
                    break;
                    
                  case 'tool_call': {
                    // Validate data object structure and extract tool information safely
                    let toolName: string | undefined;
                    let toolMessage: string | undefined;
                    
                    try {
                      // Safely extract tool name with validation
                      if (data && typeof data === 'object') {
                        toolName = (typeof data.toolName === 'string' ? data.toolName : 
                                  typeof data.name === 'string' ? data.name : undefined);
                      }
                      
                      // Tool call detected, show processing message with tool-specific text
                      toolMessage = toolName ? TOOL_LOADING_MESSAGES[toolName] : undefined;
                      
                      // Log tool call for test monitoring (sanitized - only safe properties)
                      if (typeof window !== 'undefined') {
                        if (!window.__toolCalls) {
                          window.__toolCalls = [];
                        }
                        
                        // Only log safe, non-sensitive properties
                        const sanitizedToolCall = {
                          tool: toolName || 'unknown',
                          timestamp: Date.now(),
                          type: 'tool_call'
                        };
                        
                        window.__toolCalls.push(sanitizedToolCall);
                      }
                    } catch (error) {
                      console.warn('Error processing tool call:', error instanceof Error ? error.message : 'Unknown error');
                      // Continue with fallback behavior - ensure we have safe defaults
                      toolName = undefined;
                      toolMessage = undefined;
                    }
                    
                    updateAIMessage(placeholderId, { 
                      content: currentContent,
                      isLoading: true,
                      aiState: 'processing',
                      toolMessage
                    });
                    break;
                  }
                    
                case 'tool_result': {
                  // Tool result received, merge content and any structured payload
                  if (data.result && data.result.message) {
                    currentContent = data.result.message;
                  }

                  const paymentEmbed = data.result?.data?.payment_embed;
                  const caseSummaryPdf = data.result?.data?.case_summary_pdf;
                  const matterData = data.result?.data;

                  const updates: Partial<ChatMessageUI & { isUser: false }> = {
                    content: currentContent,
                    isLoading: false
                  };

                  if (paymentEmbed) {
                    updates.paymentEmbed = paymentEmbed;
                  }

                  if (caseSummaryPdf && typeof caseSummaryPdf === 'object') {
                    const {
                      filename,
                      size,
                      generatedAt,
                      matterType,
                      storageKey
                    } = caseSummaryPdf as Record<string, unknown>;

                    if (
                      typeof filename === 'string' &&
                      typeof generatedAt === 'string' &&
                      typeof matterType === 'string' &&
                      typeof size === 'number'
                    ) {
                      updates.generatedPDF = {
                        filename,
                        size,
                        generatedAt,
                        matterType,
                        storageKey: typeof storageKey === 'string' ? storageKey : undefined
                      };
                    }
                  }

                  // Create matterCanvas from matter creation data
                  if (matterData && matterData.matter_type && matterData.description) {
                    const matterSummary = `**Client Information:**
- Name: ${matterData.name || 'Not provided'}
- Contact: ${matterData.phone || 'Not provided'}${matterData.email ? `, ${matterData.email}` : ''}${matterData.location ? `, ${matterData.location}` : ''}
${matterData.opposing_party ? `- Opposing Party: ${matterData.opposing_party}` : ''}

**Matter Details:**
- Type: ${matterData.matter_type}
- Description: ${matterData.description}
- Urgency: ${matterData.urgency || 'unknown'}`;

                    updates.matterCanvas = {
                      matterId: `${matterData.matter_type.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
                      matterNumber: `CASE-${Date.now()}`,
                      service: matterData.matter_type,
                      matterSummary,
                      answers: {
                        name: matterData.name || '',
                        email: matterData.email || '',
                        phone: matterData.phone || '',
                        location: matterData.location || '',
                        opposingParty: matterData.opposing_party || '',
                        urgency: matterData.urgency || 'unknown'
                      }
                    };
                  }

                  updateAIMessage(placeholderId, updates);
                  break;
                }
                    
                case 'final':
                    // Final response received
                    updateAIMessage(placeholderId, { 
                      content: data.response || currentContent,
                      isLoading: false,
                      aiState: null
                    });
                    
                    // Log conversation state if available
                    if (data.conversationState && typeof window !== 'undefined') {
                      window.__conversationState = data.conversationState;
                    }
                    break;
                    
                  case 'error':
                    // Error occurred
                    updateAIMessage(placeholderId, { 
                      content: data.message || 'An error occurred while processing your request.',
                      isLoading: false,
                      aiState: null
                    });
                    break;
                    
                  case 'security_block':
                    // Security block
                    updateAIMessage(placeholderId, { 
                      content: data.response || 'This request was blocked for security reasons.',
                      isLoading: false,
                      aiState: null
                    });
                    break;
                    
                  case 'contact_form':
                    // Contact form requested
                    updateAIMessage(placeholderId, { 
                      content: currentContent,
                      contactForm: data.data,
                      isLoading: false,
                      aiState: null
                    });
                    break;
                    
                  case 'complete':
                    // Stream completed
                    updateAIMessage(placeholderId, { 
                      isLoading: false,
                      aiState: null
                    });
                    break;
                }
              } catch (parseError) {
                // Log parse error with sanitized information to avoid sensitive data exposure
                const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
                console.warn('Failed to parse SSE data:', errorMessage);
                
                // Log sanitized data for debugging (without sensitive content)
                if (import.meta.env.MODE !== 'production') {
                  console.warn('Parse error context:', {
                    dataLength: combinedData?.length || 0,
                    hasData: !!combinedData,
                    errorType: parseError instanceof Error ? parseError.constructor.name : typeof parseError
                  });
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('Chat streaming error details:', {
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        isAuthError: error instanceof Error && error.message.includes('Authentication'),
        isError10000: error instanceof Error && error.message.includes('10000')
      });
      throw error;
    }
  }, [organizationId, sessionId, onError, updateAIMessage]);

  // Main message sending function
  const sendMessage = useCallback(async (message: string, attachments: FileAttachment[] = []) => {
    // Debug hook for test environment (development only)
    if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined' && window.__DEBUG_SEND_MESSAGE__) {
      window.__DEBUG_SEND_MESSAGE__(message, attachments);
    }
    
    const effectiveOrganizationId = (organizationId ?? '').trim();
    const effectiveSessionId = (sessionId ?? '').trim();

    if (!effectiveOrganizationId || !effectiveSessionId) {
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
      // Try streaming - if it fails, show a clean error message
      await sendMessageWithStreaming(messageHistory, placeholderId, attachments);
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
  }, [messages, organizationId, sessionId, createMessageHistory, sendMessageWithStreaming, onError, updateAIMessage]);

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
