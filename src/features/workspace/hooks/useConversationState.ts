/**
 * useConversationState - Centralized conversation state management
 *
 * Consolidates conversation state from useConversation and useMessageHandling
 * into a cleaner, more manageable interface.
 */

import { useState, useMemo } from 'preact/hooks';
import { useConversation } from '@/shared/hooks/useConversation';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import type { ChatMessageUI, FileAttachment } from '../../../../worker/types';
import type { ConversationMetadata } from '@/shared/types/conversation';

export interface ConversationState {
  // Core conversation data
  conversationId: string | null;
  messages: ChatMessageUI[];
  conversationMetadata: ConversationMetadata | null;
  
  // Loading states
  isLoading: boolean;
  isLoadingMore: boolean;
  messagesReady: boolean;
  
  // Connection states
  isSocketReady: boolean;
  hasMoreMessages: boolean;
  
  // Error states
  error: string | null;
  
  // Derived state
  hasMessages: boolean;
  isConversationActive: boolean;
}

export interface ConversationActions {
  // Message actions
  sendMessage: (message: string, attachments?: FileAttachment[]) => void;
  addMessage: (message: ChatMessageUI) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessageUI>) => void;
  clearMessages: () => void;
  
  // Pagination actions
  loadMoreMessages: () => void;
  
  // Reaction actions
  toggleReaction: (messageId: string, emoji: string) => void;
  requestReactions: (messageId: string) => void;
  
  // Metadata actions
  updateMetadata: (metadata: ConversationMetadata) => void;
  
  // Connection actions
  connectToConversation: (conversationId: string) => void;
  disconnect: () => void;
  
  // State actions
  setError: (error: string) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export interface UseConversationStateOptions {
  practiceId: string;
  conversationId?: string;
  mode?: 'ASK_QUESTION' | 'REQUEST_CONSULTATION' | 'PRACTICE_ONBOARDING' | null;
  linkAnonymousConversationOnLoad?: boolean;
}

export const useConversationState = ({
  practiceId,
  conversationId,
  mode,
  linkAnonymousConversationOnLoad = false,
}: UseConversationStateOptions): ConversationState & ConversationActions => {
  // Core conversation hook
  const conversation = useConversation({
    practiceId,
    conversationId,
    linkAnonymousConversationOnLoad,
  });

  // Message handling hook
  const messageHandling = useMessageHandling({
    practiceId,
    conversationId,
    mode,
  });

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const state: ConversationState = useMemo(() => ({
    conversationId,
    messages: conversation.messages || [],
    conversationMetadata: conversation.conversationMetadata,
    
    isLoading: isLoading || conversation.isLoadingMoreMessages,
    isLoadingMore: conversation.isLoadingMoreMessages,
    messagesReady: conversation.messagesReady,
    
    isSocketReady: conversation.isSocketReady,
    hasMoreMessages: conversation.hasMoreMessages || false,
    
    error: error || null,
    
    hasMessages: (conversation.messages || []).length > 0,
    isConversationActive: Boolean(conversationId && conversation.isSocketReady),
  }), [conversation, conversationId, isLoading, error]);

  // Actions
  const actions: ConversationActions = useMemo(() => ({
    sendMessage: (message, attachments) => {
      if (messageHandling.sendMessage) {
        messageHandling.sendMessage(message, attachments);
      }
    },
    
    addMessage: conversation.addMessage,
    updateMessage: conversation.updateMessage,
    clearMessages: conversation.clearMessages,
    
    loadMoreMessages: conversation.loadMoreMessages,
    
    toggleReaction: conversation.toggleMessageReaction,
    requestReactions: conversation.requestMessageReactions,
    
    updateMetadata: conversation.updateConversationMetadata,
    
    connectToConversation: conversation.connectChatRoom,
    disconnect: conversation.closeChatSocket,
    
    setError,
    clearError: () => setError(null),
    setLoading: setIsLoading,
  }), [conversation, messageHandling, setError, setIsLoading]);

  return {
    ...state,
    ...actions,
  };
};
