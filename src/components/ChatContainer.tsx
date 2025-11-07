import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import VirtualMessageList from './VirtualMessageList';
import MessageComposer from './MessageComposer';
import { ChatMessageUI } from '../../worker/types';
import { FileAttachment } from '../../worker/types';
import { ContactData } from './ContactForm';
import { createKeyPressHandler } from '../utils/keyboard';
import type { UploadingFile } from '../hooks/useFileUpload';

interface ChatContainerProps {
  messages: ChatMessageUI[];
  onSendMessage: (message: string, attachments: FileAttachment[]) => void;
  onContactFormSubmit?: (data: ContactData) => void;
  organizationConfig?: {
    name: string;
    profileImage: string | null;
    organizationId: string;
    description?: string | null;
  };
  onOpenSidebar?: () => void;
  sessionId?: string;
  organizationId?: string;
  onFeedbackSubmit?: (feedback: unknown) => void;

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
  isUsageRestricted?: boolean;
  usageMessage?: string | null;

  // Input control prop
  clearInput?: number;
  leadStatus?: 'idle' | 'pending' | 'accepted' | 'rejected';
  leadMatterNumber?: string | null;
  leadRejectionReason?: string | null;
}

const ChatContainer: FunctionComponent<ChatContainerProps> = ({
  messages,
  onSendMessage,
  onContactFormSubmit,
  organizationConfig,
  onOpenSidebar,
  sessionId,
  organizationId,
  onFeedbackSubmit,
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
  isUsageRestricted,
  usageMessage,
  clearInput,
  leadStatus = 'idle',
  leadMatterNumber,
  leadRejectionReason
}) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);


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
    if (textareaRef.current) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        textareaRef.current.blur();
      }
    }
  };

  const baseKeyHandler = createKeyPressHandler(handleSubmit);

  const handleKeyDown = (e: KeyboardEvent) => {
    // isComposing is not in TypeScript's KeyboardEvent but exists at runtime
    if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing || e.repeat) {
      return;
    }
    baseKeyHandler(e);
  };

  return (
    <div className="flex flex-col h-screen md:h-screen w-full m-0 p-0 relative overflow-hidden bg-white dark:bg-dark-bg" data-testid="chat-container">
      <main className="flex flex-col h-full w-full overflow-hidden relative bg-white dark:bg-dark-bg">
        {leadStatus !== 'idle' && (
          <div
            className={`mx-4 mt-4 rounded-lg border px-4 py-3 text-sm shadow-sm ${
              leadStatus === 'pending'
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : leadStatus === 'accepted'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                  : 'border-rose-400 bg-rose-50 text-rose-900'
            }`}
          >
            {leadStatus === 'pending' && (
              <div>
                <strong>Lead created</strong>
                {leadMatterNumber ? ` · Matter ${leadMatterNumber}` : ''}
                <div className="mt-1 text-xs">A lawyer will review your details and join the conversation shortly.</div>
              </div>
            )}
            {leadStatus === 'accepted' && (
              <div>
                <strong>Your lawyer has joined the conversation</strong>
                {leadMatterNumber ? ` · Matter ${leadMatterNumber}` : ''}
                <div className="mt-1 text-xs">Feel free to continue the discussion and share any additional information.</div>
              </div>
            )}
            {leadStatus === 'rejected' && (
              <div>
                <strong>Lead unavailable</strong>
                <div className="mt-1 text-xs">
                  {leadRejectionReason || 'This matter could not be accepted at this time. A team member will follow up with next steps.'}
                </div>
              </div>
            )}
          </div>
        )}

        <VirtualMessageList
          messages={messages}
          organizationConfig={organizationConfig}
          onOpenSidebar={onOpenSidebar}
          onContactFormSubmit={onContactFormSubmit}
          sessionId={sessionId}
          organizationId={organizationId}
          onFeedbackSubmit={onFeedbackSubmit}
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
          isUsageRestricted={isUsageRestricted}
          usageMessage={usageMessage}
        />
      </main>
    </div>
  );
};

export default ChatContainer; 
