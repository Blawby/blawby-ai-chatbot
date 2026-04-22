/**
 * useWorkspaceData - Centralized data management for workspace
 *
 * Consolidates data fetching, caching, and synchronization logic
 * for better separation of concerns and data flow.
 */

import { useState, useMemo } from 'preact/hooks';
import { useConversations } from '@/shared/hooks/useConversations';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { Conversation } from '@/shared/types/conversation';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface WorkspaceDataState {
  // Practice data
  practices: Practice[];
  currentPractice: Practice | null;
  practiceDetails: PracticeDetails | null;
  
  // Conversation data
  conversations: Conversation[];
  isLoadingConversations: boolean;
  conversationsError: string | null;
  
  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  
  // Error states
  error: string | null;
  
  // Derived state
  hasPractices: boolean;
  hasCurrentPractice: boolean;
  hasConversations: boolean;
  hasPracticeDetails: boolean;
}

export interface WorkspaceDataActions {
  // Practice actions
  refreshPractices: () => Promise<void>;
  setCurrentPractice: (practice: Practice) => void;
  updatePracticeDetails: (details: Partial<PracticeDetails>) => Promise<void>;
  
  // Conversation actions
  refreshConversations: () => Promise<void>;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  removeConversation: (conversationId: string) => void;
  
  // Data actions
  refreshAll: () => Promise<void>;
  clearError: () => void;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
}

export interface UseWorkspaceDataOptions {
  practiceId: string;
  workspaceType: 'practice' | 'client' | 'public';
  autoLoadConversations?: boolean;
  autoLoadPracticeDetails?: boolean;
  conversationScope?: 'practice' | 'user' | 'public';
}

export const useWorkspaceData = ({
  practiceId,
  workspaceType,
  autoLoadConversations = true,
  autoLoadPracticeDetails = true,
  conversationScope = 'practice',
}: UseWorkspaceDataOptions): WorkspaceDataState & WorkspaceDataActions => {
  // Practice management
  const practiceManagement = usePracticeManagement({
    autoFetchPractices: true,
    fetchPracticeDetails: autoLoadPracticeDetails,
  });

  // Practice details
  const practiceDetails = usePracticeDetails(practiceId);

  // Conversations
  const conversations = useConversations({
    practiceId,
    scope: conversationScope === 'user' ? 'all' : conversationScope === 'public' ? 'practice' : conversationScope,
    list: autoLoadConversations,
    enabled: autoLoadConversations && Boolean(practiceId),
    allowAnonymous: workspaceType === 'public',
  });

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const state: WorkspaceDataState = useMemo(() => ({
    practices: practiceManagement.practices || [],
    currentPractice: practiceManagement.currentPractice,
    practiceDetails: practiceDetails.details,
    
    conversations: conversations.conversations || [],
    isLoadingConversations: conversations.isLoading,
    conversationsError: conversations.error || null,
    
    isLoading: isLoading || practiceManagement.loading,
    isRefreshing,
    
    error: error || practiceManagement.error || conversations.error || null,
    
    hasPractices: (practiceManagement.practices || []).length > 0,
    hasCurrentPractice: Boolean(practiceManagement.currentPractice),
    hasConversations: (conversations.conversations || []).length > 0,
    hasPracticeDetails: practiceDetails.hasDetails,
  }), [
    practiceManagement,
    practiceDetails,
    conversations,
    isLoading,
    isRefreshing,
    error,
  ]);

  // Actions
  const actions: WorkspaceDataActions = useMemo(() => ({
    refreshPractices: async () => {
      setIsLoading(true);
      try {
        await practiceManagement.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh practices');
      } finally {
        setIsLoading(false);
      }
    },

    setCurrentPractice: (practice: Practice) => {
      void practice;
      throw new Error("setCurrentPractice not implemented");
    },

    updatePracticeDetails: async (updates) => {
      try {
        const normalizeToUpdate = (u: Partial<PracticeDetails>): import('@/shared/lib/apiClient').PracticeDetailsUpdate => {
          const out: import('@/shared/lib/apiClient').PracticeDetailsUpdate = {};
          if (u.businessPhone !== undefined) out.businessPhone = u.businessPhone ?? null;
          if (u.businessEmail !== undefined) out.businessEmail = u.businessEmail ?? null;
          if (u.consultationFee !== undefined) out.consultationFee = u.consultationFee ?? null;
          if (u.paymentLinkEnabled !== undefined) out.paymentLinkEnabled = u.paymentLinkEnabled ?? null;
          if (u.paymentUrl !== undefined) out.paymentUrl = u.paymentUrl ?? null;
          if (u.calendlyUrl !== undefined) out.calendlyUrl = u.calendlyUrl ?? null;
          if (u.billingIncrementMinutes !== undefined) out.billingIncrementMinutes = u.billingIncrementMinutes ?? null;
          if (u.website !== undefined) out.website = u.website ?? null;
          // Normalize address which may be string or object
          if (u.address !== undefined) {
            const addr = u.address as (string | Record<string, unknown> | null | undefined);
            if (typeof addr === 'string' || addr == null) {
              out.address = typeof addr === 'string' ? addr : null;
            } else if (typeof addr === 'object') {
              const a = addr as Record<string, unknown>;
              const trimOrNull = (val: unknown) => {
                if (typeof val !== 'string') return null;
                const trimmed = val.trim();
                return trimmed.length > 0 ? trimmed : null;
              };
              const hasKey = (k: string) => k in a;
              if (hasKey('address') || hasKey('line1') || hasKey('address_line')) out.address = trimOrNull(a.address ?? a.line1 ?? a.address_line);
              if (hasKey('apartment') || hasKey('unit')) out.apartment = trimOrNull(a.apartment ?? a.unit);
              if (hasKey('city')) out.city = trimOrNull(a.city);
              if (hasKey('state')) out.state = trimOrNull(a.state);
              if (hasKey('postalCode') || hasKey('postal_code')) out.postalCode = trimOrNull(a.postalCode ?? a.postal_code);
              if (hasKey('country')) out.country = trimOrNull(a.country);
            }
          }
          if (u.primaryColor !== undefined) out.primaryColor = u.primaryColor ?? null;
          if (u.accentColor !== undefined) out.accentColor = u.accentColor ?? null;
          if (u.introMessage !== undefined) out.introMessage = u.introMessage ?? null;
          if (u.legalDisclaimer !== undefined) out.legalDisclaimer = u.legalDisclaimer ?? null;
          if (u.isPublic !== undefined) out.isPublic = u.isPublic ?? null;
          if (u.services !== undefined) out.services = u.services ?? null;
          if (u.serviceStates !== undefined) out.serviceStates = u.serviceStates ?? null;
          if (u.supportedStates !== undefined) out.supportedStates = u.supportedStates ?? null;
          if (u.settings !== undefined) out.settings = u.settings ?? null;
          if (u.metadata !== undefined) out.metadata = u.metadata ?? null;
          return out;
        };

        const normalized = normalizeToUpdate(updates);
        await practiceDetails.updateDetails(normalized);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update practice details');
      }
    },

    refreshConversations: async () => {
      setIsRefreshing(true);
      try {
        await conversations.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh conversations');
      } finally {
        setIsRefreshing(false);
      }
    },

    addConversation: (conversation: Conversation) => {
      void conversation;
      throw new Error("addConversation not implemented");
    },

    updateConversation: (conversationId: string, updates: Partial<Conversation>) => {
      void conversationId;
      void updates;
      throw new Error("updateConversation not implemented");
    },

    removeConversation: (conversationId: string) => {
      void conversationId;
      throw new Error("removeConversation not implemented");
    },

    refreshAll: async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          practiceManagement.refetch(),
          practiceDetails.fetchDetails(),
          conversations.refresh?.(),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
      } finally {
        setIsLoading(false);
      }
    },

    clearError: () => setError(null),
    setError,
    setLoading: setIsLoading,
  }), [
    practiceManagement,
    practiceDetails,
    conversations,
    setError,
    setIsLoading,
    setIsRefreshing,
  ]);

  return {
    ...state,
    ...actions,
  };
};
