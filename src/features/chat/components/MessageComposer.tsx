import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import FileMenu from '@/features/media/components/FileMenu';
import MediaControls from '@/features/media/components/MediaControls';
import { FileDisplay } from '@/shared/ui/upload/organisms/FileDisplay';
import { FileUploadStatus } from '@/shared/ui/upload/molecules/FileUploadStatus';
import { ArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { features } from '@/config/features';
import { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { useTranslation, Trans } from '@/shared/i18n/hooks';
import type { ReplyTarget } from '@/features/chat/types';

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
    decision?: string;
    intakeUuid?: string | null;
    paymentRequired?: boolean;
    paymentReceived?: boolean;
  };
  disabled?: boolean;
  showStatusMessage?: boolean;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  footerActions?: preact.ComponentChildren;
  hideAttachmentControls?: boolean;
  hideMediaControls?: boolean;
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
  showStatusMessage = true,
  replyTo,
  onCancelReply,
  footerActions,
  hideAttachmentControls = false,
  hideMediaControls = false
}: MessageComposerProps) => {
  const { t } = useTranslation(['auth', 'common']);
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
    <div className="pl-4 pr-4 pb-2 bg-transparent rounded-none border-0 h-auto flex flex-col w-full">
      <form 
        className="w-full flex flex-col"
        aria-label="Message composition"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className="message-composer-container">
          {replyTo && (
            <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-surface-overlay/80 px-4 py-1.5 text-sm text-input-text -mx-2 -mt-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-input-text/70">
                  <Trans
                    i18nKey="chat.replyingTo"
                    values={{ name: replyTo.authorName }}
                    components={{
                      name: <span className="truncate font-semibold text-accent-500" />
                    }}
                  />
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                aria-label="Cancel reply"
                onClick={() => onCancelReply?.()}
                icon={<XMarkIcon className="h-4 w-4" />}
              />
            </div>
          )}
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
            {!hideAttachmentControls && !isRecording && (
              <div className="flex-shrink-0">
                <FileMenu
                  onFileSelect={handleFileSelect}
                  onCameraCapture={handleCameraCapture}
                  isReadyToUpload={isComposerDisabled ? false : isReadyToUpload}
                />
              </div>
            )}

            <div className="flex-1 flex items-center gap-2 rounded-full glass-input min-h-12 px-3">
              <textarea
                ref={textareaRef}
                data-testid="message-input"
                className="w-full min-h-8 py-2 m-0 text-sm sm:text-base leading-6 text-input-text bg-transparent border-none resize-none outline-none overflow-hidden box-border placeholder:text-input-placeholder"
                placeholder="Type a message..."
                rows={1}
                value={inputValue}
                onInput={handleInput}
                onKeyDown={onKeyDown}
                aria-label="Message input"
                disabled={isComposerDisabled}
              />
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
                className="w-8 h-8 p-0 rounded-full shrink-0"
                icon={<ArrowUpIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                data-testid="message-send-button"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {!hideMediaControls && features.enableAudioRecording && (
                <MediaControls onMediaCapture={handleMediaCapture} onRecordingStateChange={setIsRecording} />
              )}
            </div>
          </div>
        </div>

        {showStatusMessage && (
          <div className="text-xs text-input-text/70 text-center py-1 opacity-80">
            {statusMessage}
          </div>
        )}
      </form>
      {footerActions}
    </div>
  );
};

export default MessageComposer;
