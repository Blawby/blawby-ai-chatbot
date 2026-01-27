import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import VirtualMessageList from './VirtualMessageList';
import MessageComposer from './MessageComposer';
import { ChatMessageUI } from '../../../../worker/types';
import { FileAttachment } from '../../../../worker/types';
import { ContactData } from '@/features/intake/components/ContactForm';
import { IntakePaymentModal } from '@/features/intake/components/IntakePaymentModal';
import { isValidStripePaymentLink, type IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { createKeyPressHandler } from '@/shared/utils/keyboard';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import AuthPromptModal from './AuthPromptModal';
import type { ConversationMode } from '@/shared/types/conversation';
import type { ReplyTarget } from '@/features/chat/types';
import PublicEmbedHome from './PublicEmbedHome';
import PublicEmbedNavigation from './PublicEmbedNavigation';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import PublicConversationHeader from './PublicConversationHeader';
import PublicConversationList from './PublicConversationList';
import { useConversations } from '@/shared/hooks/useConversations';
import { fetchLatestConversationMessage } from '@/shared/lib/conversationApi';

interface ChatContainerProps {
  messages: ChatMessageUI[];
  conversationTitle?: string | null;
  onSendMessage: (message: string, attachments: FileAttachment[], replyToMessageId?: string | null) => void;
  onContactFormSubmit?: (data: ContactData) => void;
  onAddMessage?: (message: ChatMessageUI) => void;
  onSelectMode?: (mode: ConversationMode, source: 'intro_gate' | 'composer_footer') => void;
  onStartNewConversation?: (mode: ConversationMode) => void | Promise<void>;
  onNavigateHome?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRequestReactions?: (messageId: string) => void;
  conversationMode?: ConversationMode | null;
  composerDisabled?: boolean;
  isPublicWorkspace?: boolean;
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
    description?: string | null;
    slug?: string | null;
    introMessage?: string | null;
  };
  showPracticeHeader?: boolean;
  heightClassName?: string;
  onOpenSidebar?: () => void;
  practiceId?: string;
  onSelectConversation?: (conversationId: string) => void;

  // File handling props
  previewFiles: FileAttachment[];
  uploadingFiles: UploadingFile[];
  removePreviewFile: (index: number) => void;
  clearPreviewFiles: () => void;
  handleFileSelect: (files: File[]) => Promise<void>;
  handleCameraCapture: (file: File) => Promise<void>;
  cancelUpload: (fileId: string) => void;
  handleMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  isReadyToUpload?: boolean;
  isSessionReady?: boolean;
  isSocketReady?: boolean;
  intakeStatus?: {
    step: string;
  };
  conversationId?: string | null;
  isAnonymousUser?: boolean;
  canChat?: boolean;
  hasMoreMessages?: boolean;
  isLoadingMoreMessages?: boolean;
  onLoadMoreMessages?: () => void | Promise<void>;
  messagesReady?: boolean;

  // Input control prop
  clearInput?: number;
}

const ChatContainer: FunctionComponent<ChatContainerProps> = ({
  messages,
  conversationTitle,
  onSendMessage,
  onContactFormSubmit,
  onAddMessage,
  isPublicWorkspace = false,
  practiceConfig,
  showPracticeHeader = true,
  heightClassName,
  onOpenSidebar,
  practiceId,
  onSelectConversation,
  onToggleReaction,
  onRequestReactions,
  previewFiles,
  uploadingFiles,
  removePreviewFile,
  clearPreviewFiles,
  handleFileSelect,
  handleCameraCapture,
  cancelUpload,
  handleMediaCapture,
  isRecording,
  setIsRecording,
  isReadyToUpload,
  isSessionReady,
  isSocketReady,
  intakeStatus,
  clearInput,
  conversationId,
  isAnonymousUser,
  canChat = true,
  onSelectMode,
  onStartNewConversation,
  onNavigateHome,
  conversationMode,
  composerDisabled,
  hasMoreMessages,
  isLoadingMoreMessages,
  onLoadMoreMessages,
  messagesReady = true
}) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useMobileDetection();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [hasDismissedAuthPrompt, setHasDismissedAuthPrompt] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<IntakePaymentRequest | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [publicActiveTab, setPublicActiveTab] = useState<'home' | 'messages' | null>(null);
  const [publicChatOpen, setPublicChatOpen] = useState(false);
  const isChatInputLocked = Boolean(composerDisabled) || isSessionReady === false || isSocketReady === false;
  const filteredMessages = isPublicWorkspace
    ? messages.filter((message) => message.metadata?.systemMessageKey !== 'ask_question_help'
      && message.metadata?.systemMessageKey !== 'intro')
    : messages;
  const hasUserMessages = filteredMessages.some((message) => message.isUser);
  const publicIntroText = useMemo(() => {
    const intro = typeof practiceConfig?.introMessage === 'string'
      ? practiceConfig.introMessage.trim()
      : '';
    return intro || 'Ask us anything, or share your feedback.';
  }, [practiceConfig?.introMessage]);
  const {
    conversations: publicConversations,
    isLoading: isPublicConversationsLoading,
    refresh: refreshPublicConversations
  } = useConversations({
    practiceId,
    practiceSlug: practiceConfig?.slug ?? undefined,
    scope: 'practice',
    enabled: isPublicWorkspace && Boolean(practiceId)
  });
  const [publicConversationPreviews, setPublicConversationPreviews] = useState<Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }>>({});
  const fetchedPreviewIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isPublicWorkspace || publicConversations.length === 0 || !practiceId) {
      return;
    }
    let isMounted = true;
    const loadPreviews = async () => {
      const updates: Record<string, { content: string; role: string; createdAt: string }> = {};
      const toFetch = publicConversations.slice(0, 10).filter(
        (conversation) => !fetchedPreviewIds.current.has(conversation.id)
      );
      await Promise.all(toFetch.map(async (conversation) => {
        fetchedPreviewIds.current.add(conversation.id);
        const message = await fetchLatestConversationMessage(
          conversation.id,
          practiceId,
          practiceConfig?.slug ?? undefined
        ).catch(() => null);
        if (message?.content) {
          updates[conversation.id] = {
            content: message.content,
            role: message.role,
            createdAt: message.created_at
          };
        }
      }));
      if (isMounted && Object.keys(updates).length > 0) {
        setPublicConversationPreviews((prev) => ({ ...prev, ...updates }));
      }
    };
    void loadPreviews();
    return () => {
      isMounted = false;
    };
  }, [isPublicWorkspace, practiceConfig?.slug, practiceId, publicConversations]);

  const recentMessage = useMemo(() => {
    if (!isPublicWorkspace) {
      return null;
    }
    const fallbackPracticeName = typeof practiceConfig?.name === 'string'
      ? practiceConfig.name.trim()
      : '';
    const practiceAvatar = practiceConfig?.profileImage ?? null;
    if (publicConversations.length > 0) {
      const sorted = [...publicConversations].sort((a, b) => {
        const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
        const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
        return bTime - aTime;
      });
      const top = sorted[0];
      if (top) {
        const preview = publicConversationPreviews[top.id];
        const previewText = typeof preview?.content === 'string' ? preview.content.trim() : '';
        const clipped = previewText
          ? (previewText.length > 90 ? `${previewText.slice(0, 90)}…` : previewText)
          : 'Open to view messages.';
        const title = typeof top.user_info?.title === 'string' ? top.user_info?.title.trim() : '';
        const timestampLabel = preview?.createdAt
          ? formatRelativeTime(preview.createdAt)
          : (top.last_message_at ? formatRelativeTime(top.last_message_at) : '');
        return {
          preview: clipped,
          timestampLabel,
          senderLabel: title || fallbackPracticeName,
          avatarSrc: practiceAvatar,
          conversationId: top.id
        };
      }
    }
    if (filteredMessages.length === 0) {
      return null;
    }
    const candidate = [...filteredMessages]
      .reverse()
      .find((message) => message.role !== 'system' && typeof message.content === 'string' && message.content.trim().length > 0);
    if (!candidate) {
      return null;
    }
    const trimmedContent = candidate.content.trim();
    const preview = trimmedContent.length > 90
      ? `${trimmedContent.slice(0, 90)}…`
      : trimmedContent;
    const timestampLabel = candidate.timestamp
      ? formatRelativeTime(new Date(candidate.timestamp).toISOString())
      : '';
    const resolvedTitle = typeof conversationTitle === 'string' ? conversationTitle.trim() : '';
    const senderLabel = resolvedTitle || fallbackPracticeName;
    const avatarSrc = practiceAvatar;
    return {
      preview,
      timestampLabel,
      senderLabel,
      avatarSrc,
      conversationId: conversationId ?? null
    };
  }, [
    conversationTitle,
    conversationId,
    filteredMessages,
    isPublicWorkspace,
    practiceConfig?.name,
    practiceConfig?.profileImage,
    publicConversationPreviews,
    publicConversations
  ]);
  const activeTimeLabel = useMemo(() => {
    if (!isPublicWorkspace) return '';
    const lastTimestamp = [...filteredMessages]
      .reverse()
      .find((message) => typeof message.timestamp === 'number')?.timestamp;
    if (!lastTimestamp) {
      return 'Active now';
    }
    const relative = formatRelativeTime(new Date(lastTimestamp).toISOString());
    return relative ? `Active ${relative}` : 'Active now';
  }, [filteredMessages, isPublicWorkspace]);
  const defaultPublicTab = (conversationMode || hasUserMessages) ? 'messages' : 'home';
  const activePublicTab = publicActiveTab ?? defaultPublicTab;
  const showPublicHome = isPublicWorkspace && activePublicTab === 'home';
  // Simple resize handler for window size changes
  useEffect(() => {
    const handleResize = () => {
      if (textareaRef.current) {
        // Use the same improved auto-expand logic
        textareaRef.current.style.height = 'auto';
        const newHeight = Math.max(24, textareaRef.current.scrollHeight);
        textareaRef.current.style.height = `${newHeight}px`;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize textarea height on mount
  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.max(24, textareaRef.current.scrollHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, []);

  // Reset auth prompt dismissal when conversation changes
  useEffect(() => {
    setHasDismissedAuthPrompt(false);
    setShowAuthPrompt(false);
  }, [conversationId]);

  // Show auth prompt when intake enters pending review for anonymous users
  useEffect(() => {
    const shouldShow =
      isAnonymousUser &&
      intakeStatus?.step === 'pending_review' &&
      !hasDismissedAuthPrompt;

    setShowAuthPrompt(Boolean(shouldShow));

    if (!shouldShow && intakeStatus?.step !== 'pending_review') {
      setHasDismissedAuthPrompt(false);
    }
  }, [intakeStatus?.step, isAnonymousUser, hasDismissedAuthPrompt]);

  // Clear input when clearInput prop changes (numeric change counter)
  useEffect(() => {
    if (clearInput && clearInput > 0) {
      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.value = '';
        textareaRef.current.style.height = '24px';
      }
    }
  }, [clearInput]);

  const handleSubmit = () => {
    if (isChatInputLocked) return;
    if (!inputValue.trim() && previewFiles.length === 0) return;

    const message = inputValue.trim();
    const attachments = [...previewFiles];
    const replyToMessageId = replyTarget?.messageId ?? null;

    // Send message to API
    onSendMessage(message, attachments, replyToMessageId);

    // Clear preview files after sending
    clearPreviewFiles();

    // Reset input
    setInputValue('');
    setReplyTarget(null);

    // Only blur on mobile devices to collapse virtual keyboard
    if (textareaRef.current && isMobile) {
      textareaRef.current.blur();
    }
  };

  const baseKeyHandler = createKeyPressHandler(handleSubmit);

  const handleKeyDown = (e: KeyboardEvent) => {
    // isComposing is not in TypeScript's KeyboardEvent but exists at runtime
    if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing || e.repeat) {
      return;
    }
    if (isChatInputLocked) {
      return;
    }
    baseKeyHandler(e);
  };

  const handleAuthPromptClose = () => {
    setHasDismissedAuthPrompt(true);
    setShowAuthPrompt(false);
  };

  const handleAuthSuccess = () => {
    setHasDismissedAuthPrompt(true);
    setShowAuthPrompt(false);
  };

  const handleOpenPayment = (request: IntakePaymentRequest) => {
    const hasClientSecret = typeof request.clientSecret === 'string' &&
      request.clientSecret.trim().length > 0;
    if (!hasClientSecret &&
      request.paymentLinkUrl &&
      isValidStripePaymentLink(request.paymentLinkUrl) &&
      typeof window !== 'undefined') {
      window.open(request.paymentLinkUrl, '_blank', 'noopener');
      return;
    }
    setPaymentRequest(request);
    setIsPaymentModalOpen(true);
  };

  const handleClosePayment = () => {
    setIsPaymentModalOpen(false);
  };

  const handlePaymentSuccess = () => {
    if (!paymentRequest || !onAddMessage) {
      handleClosePayment();
      return;
    }

    onAddMessage({
      id: `system-payment-confirm-${paymentRequest.intakeUuid ?? Date.now()}`,
      role: 'assistant',
      content: `Payment received. ${paymentRequest.practiceName || 'The practice'} will review your intake and follow up here shortly.`,
      timestamp: Date.now(),
      isUser: false
    });
    handleClosePayment();
  };

  const handleModeSelection = (mode: ConversationMode, source: 'intro_gate' | 'composer_footer') => {
    if (!onSelectMode) return;
    onSelectMode(mode, source);
    if (isPublicWorkspace) {
      setPublicActiveTab('messages');
      setPublicChatOpen(true);
    }
  };

  const handleAskQuestion = () => {
    handleModeSelection('ASK_QUESTION', 'intro_gate');
  };

  const handleRequestConsultation = () => {
    handleModeSelection('REQUEST_CONSULTATION', 'intro_gate');
  };

  const handleStartNewConversation = () => {
    if (onStartNewConversation) {
      void Promise.resolve(onStartNewConversation('ASK_QUESTION'))
        .finally(() => {
          if (isPublicWorkspace) {
            setPublicActiveTab('messages');
            setPublicChatOpen(true);
          }
        });
      return;
    }
    handleAskQuestion();
  };

  const handleSelectPublicConversation = (conversationId: string) => {
    onSelectConversation?.(conversationId);
    setPublicActiveTab('messages');
    setPublicChatOpen(true);
  };

  const containerClassName = `flex flex-col ${heightClassName ?? 'h-screen md:h-screen'} w-full m-0 p-0 relative overflow-hidden ${isPublicWorkspace ? 'bg-light-bg dark:bg-dark-bg' : 'bg-white dark:bg-dark-bg'}`;
  const mainClassName = `flex flex-col flex-1 min-h-0 w-full overflow-hidden relative ${isPublicWorkspace ? 'items-center px-3 py-4' : 'bg-white dark:bg-dark-bg'}`;
  const frameClassName = isPublicWorkspace
    ? 'flex flex-col flex-1 min-h-0 w-full max-w-[420px] rounded-[32px] bg-light-bg dark:bg-dark-bg shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-light-border dark:border-white/20 overflow-hidden'
    : 'flex flex-col flex-1 min-h-0 w-full';

  const handleReply = (target: ReplyTarget) => {
    setReplyTarget(target);
    textareaRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyTarget(null);
  };

  return (
    <div
      className={containerClassName}
      data-testid="chat-container"
    >
      <main className={mainClassName}>
        {canChat ? (
          <div className={frameClassName}>
            {showPublicHome ? (
              <PublicEmbedHome
                practiceName={practiceConfig?.name}
                practiceLogo={practiceConfig?.profileImage ?? null}
                onSendMessage={(onStartNewConversation || onSelectMode) ? handleStartNewConversation : undefined}
                onRequestConsultation={onSelectMode ? handleRequestConsultation : undefined}
                recentMessage={recentMessage}
                onOpenRecentMessage={() => {
                  if (recentMessage?.conversationId) {
                    handleSelectPublicConversation(recentMessage.conversationId);
                    return;
                  }
                  setPublicActiveTab('messages');
                  setPublicChatOpen(false);
                }}
              />
            ) : (
              <>
                {isPublicWorkspace && activePublicTab === 'messages' && !publicChatOpen ? (
                  <PublicConversationList
                    conversations={publicConversations}
                    previews={publicConversationPreviews}
                    practiceName={practiceConfig?.name}
                    practiceLogo={practiceConfig?.profileImage ?? null}
                    isLoading={isPublicConversationsLoading}
                    onClose={() => {
                      onNavigateHome?.();
                      setPublicActiveTab('home');
                      setPublicChatOpen(false);
                    }}
                    onSelectConversation={handleSelectPublicConversation}
                    onSendMessage={handleStartNewConversation}
                  />
                ) : (
                  <>
                    {isPublicWorkspace && (
                      <PublicConversationHeader
                        practiceName={practiceConfig?.name}
                        practiceLogo={practiceConfig?.profileImage ?? null}
                        activeLabel={activeTimeLabel}
                        onBack={() => {
                          onNavigateHome?.();
                          setPublicActiveTab('home');
                          setPublicChatOpen(false);
                        }}
                      />
                    )}
                    <div className="flex flex-1 min-h-0 flex-col">
                      {isPublicWorkspace && filteredMessages.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-start px-6 pt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          <p className="max-w-[300px]">{publicIntroText}</p>
                        </div>
                      ) : (
                        <VirtualMessageList
                          messages={messagesReady ? filteredMessages : []}
                          conversationTitle={conversationTitle}
                          practiceConfig={practiceConfig}
                          showPracticeHeader={showPracticeHeader && !isPublicWorkspace}
                          isPublicWorkspace={isPublicWorkspace}
                          onOpenSidebar={onOpenSidebar}
                          onContactFormSubmit={onContactFormSubmit}
                          onOpenPayment={handleOpenPayment}
                          practiceId={practiceId}
                          onReply={handleReply}
                          onToggleReaction={onToggleReaction}
                          onRequestReactions={onRequestReactions}
                          intakeStatus={intakeStatus}
                          modeSelectorActions={onSelectMode ? {
                            onAskQuestion: handleAskQuestion,
                            onRequestConsultation: handleRequestConsultation
                          } : undefined}
                          hasMoreMessages={hasMoreMessages}
                          isLoadingMoreMessages={isLoadingMoreMessages}
                          onLoadMoreMessages={onLoadMoreMessages}
                          showSkeleton={!messagesReady}
                        />
                      )}
                    </div>
                    
                    <MessageComposer
                      inputValue={inputValue}
                      setInputValue={setInputValue}
                      previewFiles={previewFiles}
                      uploadingFiles={uploadingFiles}
                      removePreviewFile={removePreviewFile}
                      handleFileSelect={handleFileSelect}
                      handleCameraCapture={handleCameraCapture}
                      cancelUpload={cancelUpload}
                      isRecording={isRecording}
                      handleMediaCapture={handleMediaCapture}
                      setIsRecording={setIsRecording}
                      onSubmit={handleSubmit}
                      onKeyDown={handleKeyDown}
                      textareaRef={textareaRef}
                      isReadyToUpload={isReadyToUpload}
                      isSessionReady={isSessionReady}
                      isSocketReady={isSocketReady}
                      intakeStatus={intakeStatus}
                      disabled={composerDisabled}
                      showStatusMessage={!isPublicWorkspace}
                      replyTo={replyTarget}
                      onCancelReply={handleCancelReply}
                    />
                  </>
                )}
              </>
            )}

            {isPublicWorkspace && (showPublicHome || (activePublicTab === 'messages' && !publicChatOpen)) && (
              <PublicEmbedNavigation
                activeTab={activePublicTab}
                onSelectTab={(tab) => {
                  setPublicActiveTab(tab);
                  if (tab === 'messages') {
                    setPublicChatOpen(false);
                    void refreshPublicConversations();
                  } else {
                    setPublicChatOpen(false);
                  }
                }}
              />
            )}
          </div>
        ) : null}
      </main>

      <AuthPromptModal
        isOpen={showAuthPrompt}
        onClose={handleAuthPromptClose}
        practiceName={practiceConfig?.name}
        onSuccess={handleAuthSuccess}
        conversationId={conversationId ?? undefined}
        practiceId={practiceId}
      />

      <IntakePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={handleClosePayment}
        paymentRequest={paymentRequest}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};

export default ChatContainer; 
