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
  clearInput
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
