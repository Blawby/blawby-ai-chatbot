/**
 * PracticeOnboardingPage - Clean onboarding page architecture
 *
 * Replaces the monolithic WorkspacePage practice onboarding section
 * with a cleaner, more maintainable component structure.
 */

import { FunctionComponent } from 'preact';
import { useMemo, useState, useCallback } from 'preact/hooks';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { SplitView } from '@/shared/ui/layout/SplitView';
import OnboardingChat from '../components/OnboardingChat';
import OnboardingActions from '../components/OnboardingActions';
import OnboardingModals from '../components/OnboardingModals';
import type { PracticeSetupStatus } from '../../practice-setup/utils/status';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { FileAttachment, ChatMessageUI } from '../../../../worker/types';
import { useOnboardingState } from '../hooks/useOnboardingState';

export interface PracticeOnboardingPageProps {
  status: PracticeSetupStatus;
  practice: Practice | null;
  details: PracticeDetails | null;
  onSaveBasics?: (values: {
    name: string;
    slug: string;
    introMessage: string;
    accentColor: string;
  }) => Promise<void>;
  onSaveContact?: (values: {
    website: string;
    businessEmail: string;
    businessPhone: string;
    address?: {
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  }) => Promise<void>;
  servicesSlot?: {
    children: React.ReactNode;
  };
  payoutsSlot?: {
    children: React.ReactNode;
  };
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  onProgressChange?: (snapshot: {
    fields: Record<string, unknown>;
    hasPendingSave: boolean;
    completionScore: number;
    missingFields: string[];
  }) => void;
  chatAdapter?: {
    messages: ChatMessageUI[];
    sendMessage: (
      message: string,
      attachments?: FileAttachment[],
      replyToMessageId?: string | null,
      options?: { additionalContext?: string }
    ) => void | Promise<void>;
    messagesReady?: boolean;
    isSocketReady?: boolean;
    hasMoreMessages?: boolean;
    isLoadingMoreMessages?: boolean;
    onLoadMoreMessages?: () => void | Promise<void>;
    onToggleReaction?: (messageId: string, emoji: string) => void;
    onRequestReactions?: (messageId: string) => void | Promise<void>;
  } | null;
}

const PracticeOnboardingPage: FunctionComponent<PracticeOnboardingPageProps> = ({
  status,
  practice,
  details,
  onSaveBasics,
  onSaveContact,
  servicesSlot,
  payoutsSlot,
  logoUploading,
  logoUploadProgress,
  onLogoChange,
  onProgressChange,
  chatAdapter,
}) => {
  const { state, actions } = useOnboardingState();
  
  // Modal state management
  const [basicsModalOpen] = useState(false);
  const [contactModalOpen] = useState(false);
  
  const handleEditBasics = useCallback(() => {
    // Modal opening logic would go here
  }, []);
  
  const handleEditContact = useCallback(() => {
    // Modal opening logic would go here
  }, []);

  const handleSaveBasics = useCallback(async (values: {
    name: string;
    slug: string;
    introMessage: string;
    accentColor: string;
  }) => {
    if (!onSaveBasics) return;
    try {
      await onSaveBasics(values);
    } catch (error) {
      console.error('Failed to save basics:', error);
    }
  }, [onSaveBasics]);

  const handleSaveContact = useCallback(async (values: {
    website: string;
    businessEmail: string;
    businessPhone: string;
    address?: {
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  }) => {
    if (!onSaveContact) return;
    try {
      await onSaveContact(values);
    } catch (error) {
      console.error('Failed to save contact:', error);
    }
  }, [onSaveContact]);

  const handleSaveAll = useCallback(async () => {
    actions.setIsSaving(true);
    actions.setSaveError(null);
    
    try {
      // This would trigger saving of all pending changes
      // Implementation depends on how you want to handle "Save All"
      console.log('Save all triggered');
    } catch (error) {
      actions.setSaveError(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      actions.setIsSaving(false);
    }
  }, [actions]);

  const chatAdapterProps = useMemo(() => ({
    messages: chatAdapter?.messages || [],
    sendMessage: chatAdapter?.sendMessage || (() => {}),
    messagesReady: chatAdapter?.messagesReady,
    isSocketReady: chatAdapter?.isSocketReady,
    hasMoreMessages: chatAdapter?.hasMoreMessages,
    isLoadingMoreMessages: chatAdapter?.isLoadingMoreMessages,
    onLoadMoreMessages: chatAdapter?.onLoadMoreMessages,
    onToggleReaction: chatAdapter?.onToggleReaction,
    onRequestReactions: chatAdapter?.onRequestReactions,
  }), [chatAdapter]);

  return (
    <Page className="h-full">
      <PageHeader
        title="Practice Setup"
        subtitle="Configure your practice information and preferences"
      />

      <SplitView
        primary={
          <div className="flex-1 min-h-0">
            <OnboardingChat
              status={status}
              practice={practice}
              details={details}
              chatAdapter={chatAdapterProps}
              logoUploading={logoUploading}
              logoUploadProgress={logoUploadProgress}
              onLogoChange={onLogoChange}
              onProgressChange={onProgressChange}
              extractedFields={{}}
              onFieldUpdate={() => {}}
            />
          </div>
        }
        secondary={
          <div className="w-96 min-w-0 space-y-6">
            <OnboardingActions
              status={status}
              onSaveBasics={handleSaveBasics}
              onSaveContact={handleSaveContact}
              servicesSlot={servicesSlot ? { children: servicesSlot } : undefined}
              payoutsSlot={payoutsSlot ? { children: payoutsSlot } : undefined}
              logoUploading={logoUploading}
              logoUploadProgress={logoUploadProgress}
              onLogoChange={onLogoChange}
              isSaving={state.isSaving}
              saveError={state.saveError}
              onEditBasics={handleEditBasics}
              onEditContact={handleEditContact}
              onSaveAll={handleSaveAll}
            />
          </div>
        }
      />

      {/* Modals */}
      <OnboardingModals
        practice={practice}
        details={details}
        onSaveBasics={handleSaveBasics}
        onSaveContact={handleSaveContact}
        isModalSaving={state.isSaving}
        onSetModalSaving={actions.setIsModalSaving}
      />
    </Page>
  );
};

export default PracticeOnboardingPage;
