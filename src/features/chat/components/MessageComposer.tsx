import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import FileMenu from '@/features/media/components/FileMenu';
import MediaControls from '@/features/media/components/MediaControls';
import { FileDisplay } from '@/shared/ui/upload/organisms/FileDisplay';
import { FileUploadStatus } from '@/shared/ui/upload/molecules/FileUploadStatus';
import { ArrowUpIcon } from "@heroicons/react/24/outline";
import { features } from '@/config/features';
import { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { useTranslation } from '@/shared/i18n/hooks';
import type { ConversationMode } from '@/shared/types/conversation';

interface MessageComposerProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  previewFiles: FileAttachment[];
  uploadingFiles: UploadingFile[];
  removePreviewFile: (index: number) => void;
  handleFileSelect: (files: File[]) => Promise<void>;
  handleCameraCapture: (file: File) => Promise<void>;
  cancelUpload: (fileId: string) => void;
  isRecording: boolean;
  handleMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
  setIsRecording: (recording: boolean) => void;
  onSubmit: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  isReadyToUpload?: boolean;
  isSessionReady?: boolean;
  isSocketReady?: boolean;
  intakeStatus?: {
    step: string;
  };
  disabled?: boolean;
  conversationMode?: ConversationMode | null;
  onRequestConsultation?: () => void;
}

const MessageComposer = ({
  inputValue,
  setInputValue,
  previewFiles,
  uploadingFiles,
  removePreviewFile,
  handleFileSelect,
  handleCameraCapture,
  cancelUpload,
  isRecording,
  handleMediaCapture,
  setIsRecording,
  onSubmit,
  onKeyDown,
  textareaRef,
  isReadyToUpload,
  isSessionReady,
  isSocketReady,
  intakeStatus,
  disabled,
  conversationMode,
  onRequestConsultation
}: MessageComposerProps) => {
  const { t } = useTranslation('auth');
  const intakeStep = intakeStatus?.step;
  const isIntakeLocked =
    intakeStep === 'pending_review' ||
    intakeStep === 'accepted' ||
    intakeStep === 'rejected';
  const isComposerDisabled = Boolean(disabled) || isSessionReady === false || isSocketReady === false || isIntakeLocked;

  const handleInput = (e: Event & { currentTarget: HTMLTextAreaElement }) => {
    const t = e.currentTarget;
    setInputValue(t.value);
    t.style.height = 'auto';
    t.style.height = `${Math.max(32, t.scrollHeight)}px`;
  };

  const handleSubmit = () => {
    if (!inputValue.trim() && previewFiles.length === 0) return;
    if (isComposerDisabled) return;
    onSubmit();
    const el = textareaRef.current;
    if (el) { el.style.height = ''; }
  };

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(32, el.scrollHeight)}px`;
  }, [inputValue, textareaRef]);

  const statusMessage = (() => {
    if (isIntakeLocked) {
      if (intakeStep === 'accepted') {
        return t('intake.accepted');
      }
      if (intakeStep === 'rejected') {
        return t('intake.rejected');
      }
      return t('intake.pending');
    }
    if (isSessionReady === false) {
      return 'Setting up a secure session...';
    }
    if (isSocketReady === false) {
      return 'Connecting to chat...';
    }
    return 'Blawby can make mistakes. Check for important information.';
  })();

  // Block when session is not ready or intake is awaiting review/decision
  const sendDisabled = (
    (!inputValue.trim() && previewFiles.length === 0) ||
    isComposerDisabled
  );

  return (
    <form 
      className="pl-4 pr-4 pb-2 bg-white dark:bg-dark-bg h-auto flex flex-col w-full sticky bottom-0 z-[1000] backdrop-blur-md" 
      aria-label="Message composition"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="message-composer-container">
        {/* Show all files (uploading + preview) in one horizontal container */}
        {(uploadingFiles.length > 0 || previewFiles.length > 0) && (
          <div className="message-composer-preview-container" role="list" aria-label="File attachments">
            {/* Uploading files - newest first */}
            {uploadingFiles.slice().reverse().map(file => (
              <FileUploadStatus
                key={file.id}
                file={file}
                onCancel={() => cancelUpload(file.id)}
              />
            ))}
            
            {/* Preview files - newest first */}
            {previewFiles.slice().reverse().map((file, index) => (
              <FileDisplay
                key={file.url || `${file.name}-${index}`}
                file={file}
                status="preview"
                onRemove={() => removePreviewFile(previewFiles.length - 1 - index)}
              />
            ))}
          </div>
        )}

        <div className="message-composer-input-row">
          {!isRecording && (
            <div className="flex-shrink-0">
              <FileMenu
                onFileSelect={handleFileSelect}
                onCameraCapture={handleCameraCapture}
                isReadyToUpload={isComposerDisabled ? false : isReadyToUpload}
              />
            </div>
          )}
          {conversationMode === 'ASK_QUESTION' && onRequestConsultation && (
            <div className="flex-shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onRequestConsultation}
                disabled={isComposerDisabled}
              >
                {t('chat.requestConsultation')}
              </Button>
            </div>
          )}
          
          <div className="flex-1 flex items-center">
            <textarea
              ref={textareaRef}
              data-testid="message-input"
              className="w-full min-h-8 py-1 m-0 text-sm sm:text-base leading-6 text-gray-900 dark:text-white bg-transparent border-none resize-none outline-none overflow-hidden box-border placeholder:text-gray-500 dark:placeholder:text-gray-400"
              placeholder="Type a message..."
              rows={1}
              value={inputValue}
              onInput={handleInput}
              onKeyDown={onKeyDown}
              aria-label="Message input"
              disabled={isComposerDisabled}
            />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {features.enableAudioRecording && (
              <MediaControls onMediaCapture={handleMediaCapture} onRecordingStateChange={setIsRecording} />
            )}
            <Button
              type="submit"
              variant={inputValue.trim() || previewFiles.length > 0 ? 'primary' : 'secondary'}
              size="sm"
              disabled={sendDisabled}
              aria-label={
                isSessionReady === false
                  ? 'Send message (waiting for secure session)'
                  : isSocketReady === false
                  ? 'Send message (connecting to chat)'
                  : (!inputValue.trim() && previewFiles.length === 0
                  ? 'Send message (disabled)'
                  : 'Send message')}
              className="w-8 h-8 p-0 rounded-full"
              icon={<ArrowUpIcon className="w-3.5 h-3.5" aria-hidden="true" />}
              data-testid="message-send-button"
            />
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-600 dark:text-gray-400 text-center py-1 opacity-80">
        {statusMessage}
      </div>
    </form>
  );
};

export default MessageComposer;
