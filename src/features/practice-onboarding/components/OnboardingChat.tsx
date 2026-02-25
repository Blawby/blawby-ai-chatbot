/**
 * OnboardingChat - Dedicated chat interface for practice onboarding
 *
 * Handles only the chat conversation aspects, extracting the chat logic
 * from the monolithic PracticeSetup component.
 */

import { FunctionComponent } from 'preact';
import { useCallback } from 'preact/hooks';
import { useMemo } from 'preact/hooks';
import { SparklesIcon } from '@heroicons/react/24/outline';
import ChatContainer from '@/features/chat/components/ChatContainer';
import ConversationalCorrection from './ConversationalCorrection';
import type { ChatMessageUI } from '../../../../worker/types';
import type { PracticeSetupStatus } from '../../practice-setup/utils/status';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import type { ExtractedFields } from '../types/onboardingFields';
import { initializeAccentColor } from '@/shared/utils/accentColors';

export interface OnboardingChatProps {
  status: PracticeSetupStatus;
  practice: Practice | null;
  details: PracticeDetails | null;
  chatAdapter: {
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
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  onProgressChange: (snapshot: {
    fields: ExtractedFields;
    hasPendingSave: boolean;
    completionScore?: number;
    missingFields: string[];
  }) => void;
  extractedFields: ExtractedFields;
  onFieldUpdate: (field: keyof ExtractedFields, value: string) => void;
}

const OnboardingChat: FunctionComponent<OnboardingChatProps> = ({
  status,
  practice,
  details,
  chatAdapter,
  logoUploading,
  logoUploadProgress,
  onLogoChange,
  onProgressChange,
  extractedFields,
  onFieldUpdate,
}) => {
  const practiceId = practice?.id ?? '';
  const waitingForRealChat = chatAdapter === null;

  const openingFallbackMessage = useMemo<ChatMessageUI>(() => ({
    id: 'opening',
    role: 'assistant',
    timestamp: Date.now(),
    seq: 1,
    isUser: false,
    content: status.needsSetup
      ? "Let's get your practice set up. To start, what's the name of your practice?"
      : `Welcome back! Your profile looks good. Want to update anything, or shall I walk you through what's still missing?`,
  }), []); // intentionally stable — only computed once

  const onboardingPracticeConfig = useMemo(() => ({
    name: practice?.name ?? 'Practice',
    profileImage: practice?.logo ?? null,
    practiceId: practiceId || (practice?.id ?? ''),
    description: details?.description ?? practice?.description ?? '',
    slug: practice?.slug ?? undefined,
  }), [details?.description, practice, practiceId]);

  const fallbackUiMessages = useMemo<ChatMessageUI[]>(() => [openingFallbackMessage], [openingFallbackMessage]);
  const resolvedChatMessages = useMemo(() => {
    if (!chatAdapter?.messages) return fallbackUiMessages;
    return chatAdapter.messages.length > 0 ? chatAdapter.messages : fallbackUiMessages;
  }, [chatAdapter?.messages, fallbackUiMessages]);

  // Handle conversational corrections
  const handleCorrectionResponse = useCallback((field: keyof ExtractedFields, response: string) => {
    onFieldUpdate(field, response);
    
    // Send confirmation message
    if (chatAdapter?.sendMessage) {
      const confirmation = getFieldConfirmation(field, response);
      void chatAdapter.sendMessage(confirmation);
    }
  }, [onFieldUpdate, chatAdapter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-input-placeholder">
          {status.needsSetup ? "Let's get started" : 'Practice setup'}
        </p>
        <h2 className="text-3xl font-bold tracking-tight">
          {status.needsSetup ? 'Almost ready to go' : 'All set'}
        </h2>
      </header>

      {/* Conversational Corrections */}
      {Object.keys(extractedFields).length > 0 && (
        <ConversationalCorrection
          extractedFields={extractedFields}
          onFieldUpdate={onFieldUpdate}
          onRequestCorrection={(field) => {
            if (chatAdapter?.sendMessage) {
              const question = getCorrectionQuestion(field, String(extractedFields[field]));
              void chatAdapter.sendMessage(question);
            }
          }}
        />
      )}

      {/* Chat Panel */}
      <section className="glass-card p-4 sm:p-5">
        <div className="h-[500px] min-h-0">
          <ChatContainer
            messages={resolvedChatMessages}
            onSendMessage={(message, attachments, replyToMessageId) => {
              if (waitingForRealChat) return;
              if (chatAdapter?.sendMessage) {
                void (async () => {
                  const trimmed = message.trim();
                  if (!trimmed) return;
                  const urlMatch = trimmed.match(/https?:\/\/[^\s]+|(?:www\.)[^\s]+\.[a-z]{2,}/i);
                  const progressSnapshot = onProgressChange?.({ fields: extractedFields, hasPendingSave: false, completionScore: 0, missingFields: [] });
                  onProgressChange?.({ fields: extractedFields, hasPendingSave: false, completionScore: 0, missingFields: [] });
                  const completionScore = 0;
                  const needsRichData = completionScore < 40;
                  const looksLikeBusinessName = trimmed.length > 5 && (trimmed.includes(' ') || trimmed.includes('.'));
                  let additionalContext: string | undefined;

                  // Check for conversational corrections
                  const correctionField = detectCorrectionField(trimmed, extractedFields);
                  if (correctionField) {
                    handleCorrectionResponse(correctionField, trimmed);
                    return;
                  }

                  if (urlMatch || (needsRichData && looksLikeBusinessName)) {
                    // This would be handled by parent component
                    return;
                  }
                  await chatAdapter.sendMessage(message, attachments, replyToMessageId, { additionalContext });
                })();
                return;
              }
            }}
            isPublicWorkspace={false}
            practiceConfig={onboardingPracticeConfig}
            layoutMode="desktop"
            useFrame={false}
            practiceId={practiceId || undefined}
            composerDisabled={waitingForRealChat}
            previewFiles={[]}
            uploadingFiles={[]}
            removePreviewFile={() => {}}
            clearPreviewFiles={() => {}}
            handleFileSelect={async (files: File[]) => { onLogoChange(files); }}
            handleCameraCapture={async (file: File) => await onLogoChange([file])}
            cancelUpload={() => {}}
            handleMediaCapture={() => {}}
            isRecording={false}
            setIsRecording={() => {}}
            isReadyToUpload={true}
            isSessionReady={!waitingForRealChat}
            isSocketReady={waitingForRealChat ? false : (chatAdapter?.isSocketReady ?? true)}
            messagesReady={waitingForRealChat ? false : (chatAdapter?.messagesReady ?? true)}
            onToggleReaction={chatAdapter?.onToggleReaction}
            onRequestReactions={chatAdapter?.onRequestReactions}
            hasMoreMessages={chatAdapter?.hasMoreMessages}
            isLoadingMoreMessages={chatAdapter?.isLoadingMoreMessages}
            onLoadMoreMessages={chatAdapter?.onLoadMoreMessages}
            onboardingActions={{
              onSaveAll: undefined, // This will be handled by parent
              onEditBasics: undefined, // This will be handled by parent
              onEditContact: undefined, // This will be handled by parent
              onLogoChange,
              logoUploading,
              logoUploadProgress,
              practiceName: practice?.name ?? 'Practice',
              isSaving: false, // This will be handled by parent
              saveError: null, // This will be handled by parent
            }}
            headerContent={
              <div className="flex items-center justify-between mb-2 gap-3 px-4 pt-3">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-accent-500" />
                  <div>
                    <div className="text-sm font-semibold">Setup assistant</div>
                    {status.needsSetup ? (
                      <div className="text-[10px] text-input-placeholder">Onboarding</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-input-placeholder">
                    Onboarding
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </section>
    </div>
  );
};

// Helper functions for conversational corrections
function detectCorrectionField(message: string, extractedFields: ExtractedFields): keyof ExtractedFields | null {
  const lowerMessage = message.toLowerCase();
  
  // Check for phone corrections
  if (lowerMessage.includes('phone') || lowerMessage.includes('call') || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(message)) {
    return 'contactPhone';
  }
  
  // Check for email corrections
  if (lowerMessage.includes('email') || /@[^\s]+\.[^\s]+/.test(message)) {
    return 'businessEmail';
  }
  
  // Check for website corrections
  if (lowerMessage.includes('website') || /https?:\/\/[^\s]+/.test(message)) {
    return 'website';
  }
  
  // Check for remote practice responses
  if (lowerMessage.includes('remote') || lowerMessage.includes('no office') || lowerMessage.includes('physical')) {
    return 'isRemote';
  }
  
  return null;
}

function getCorrectionQuestion(field: keyof ExtractedFields, currentValue?: string): string {
  switch (field) {
    case 'contactPhone':
      return `I found this phone number: ${currentValue || 'not provided'}. Is this correct, or what's the right number?`;
    case 'businessEmail':
      return `I found this email: ${currentValue || 'not provided'}. Is this correct, or what's the right email?`;
    case 'website':
      return `I found this website: ${currentValue || 'not provided'}. Is this correct, or what's the right website?`;
    case 'isRemote':
      return 'Are you fully remote with no physical office, or do you have a physical address?';
    default:
      return `Could you clarify the ${field}?`;
  }
}

function getFieldConfirmation(field: keyof ExtractedFields, value: string): string {
  switch (field) {
    case 'contactPhone':
      return `Got it! I've updated your phone number to ${value}.`;
    case 'businessEmail':
      return `Thanks! I've updated your email to ${value}.`;
    case 'website':
      return `Perfect! I've updated your website to ${value}.`;
    case 'isRemote':
      return value.toLowerCase().includes('remote') 
        ? "Got it! I've marked you as fully remote - no physical address needed."
        : "Thanks! I'll make sure to collect your physical address information.";
    default:
      return `Thanks! I've updated the ${field}.`;
  }
}

export default OnboardingChat;
