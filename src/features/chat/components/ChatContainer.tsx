import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import VirtualMessageList from './VirtualMessageList';
import MessageComposer from './MessageComposer';
import { ChatMessageUI } from '../../../../worker/types';
import { FileAttachment } from '../../../../worker/types';
import { ContactData } from '@/features/intake/components/ContactForm';
import { IntakePaymentModal } from '@/features/intake/components/IntakePaymentModal';
import type { IntakePaymentRequest } from '@/shared/utils/intakePayments';
import { createKeyPressHandler } from '@/shared/utils/keyboard';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import AuthPromptModal from './AuthPromptModal';
import LawyerSearchInline from '@/features/lawyer-search/components/LawyerSearchInline';
import type { ConversationMode } from '@/shared/types/conversation';

interface ChatContainerProps {
  messages: ChatMessageUI[];
  onSendMessage: (message: string, attachments: FileAttachment[]) => void;
  onContactFormSubmit?: (data: ContactData) => void;
  onAddMessage?: (message: ChatMessageUI) => void;
  onSelectMode?: (mode: ConversationMode, source: 'intro_gate' | 'composer_footer') => void;
  conversationMode?: ConversationMode | null;
  composerDisabled?: boolean;
  practiceConfig?: {
    name: string;
    profileImage: string | null;
    practiceId: string;
    description?: string | null;
  };
  onOpenSidebar?: () => void;
  practiceId?: string;

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
  intakeStatus?: {
    step: string;
  };
  conversationId?: string | null;
  isAnonymousUser?: boolean;
  canChat?: boolean;

  // Input control prop
  clearInput?: number;
}

const ChatContainer: FunctionComponent<ChatContainerProps> = ({
  messages,
  onSendMessage,
  onContactFormSubmit,
  onAddMessage,
  practiceConfig,
  onOpenSidebar,
  practiceId,
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
  intakeStatus,
  clearInput,
  conversationId,
  isAnonymousUser,
  canChat = true,
  onSelectMode,
  conversationMode,
  composerDisabled
}) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useMobileDetection();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [hasDismissedAuthPrompt, setHasDismissedAuthPrompt] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<IntakePaymentRequest | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
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
    if (composerDisabled) return;
    if (!inputValue.trim() && previewFiles.length === 0) return;

    const message = inputValue.trim();
    const attachments = [...previewFiles];

    // Send message to API
    onSendMessage(message, attachments);

    // Clear preview files after sending
    clearPreviewFiles();

    // Reset input
    setInputValue('');

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
    if (composerDisabled) {
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

  return (
    <div className="flex flex-col h-screen md:h-screen w-full m-0 p-0 relative overflow-hidden bg-white dark:bg-dark-bg" data-testid="chat-container">
      <main className="flex flex-col h-full w-full overflow-hidden relative bg-white dark:bg-dark-bg">
        {canChat ? (
          <>
            <VirtualMessageList
              messages={messages}
              practiceConfig={practiceConfig}
              onOpenSidebar={onOpenSidebar}
              onContactFormSubmit={onContactFormSubmit}
              onOpenPayment={handleOpenPayment}
              practiceId={practiceId}
              intakeStatus={intakeStatus}
              modeSelectorActions={onSelectMode ? {
                onAskQuestion: () => onSelectMode('ASK_QUESTION', 'intro_gate'),
                onRequestConsultation: () => onSelectMode('REQUEST_CONSULTATION', 'intro_gate')
              } : undefined}
            />
            
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
              intakeStatus={intakeStatus}
              disabled={composerDisabled}
              conversationMode={conversationMode}
              onRequestConsultation={() => onSelectMode?.('REQUEST_CONSULTATION', 'composer_footer')}
            />
          </>
        ) : (
          <LawyerSearchInline />
        )}
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
