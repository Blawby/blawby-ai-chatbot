import type { RefObject } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useState } from 'preact/hooks';
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

const MIN_TEXTAREA_HEIGHT = 32;
const MAX_TEXTAREA_HEIGHT = 144;
const MOBILE_MAX_TEXTAREA_HEIGHT = 112;
const SOFT_CHAR_LIMIT = 1500;
const HARD_WARN_LIMIT = 2000;

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
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isTextareaScrollable, setIsTextareaScrollable] = useState(false);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const intakeStep = intakeStatus?.step;
  const isIntakeLocked =
    intakeStep === 'pending_review' ||
    intakeStep === 'accepted' ||
    intakeStep === 'rejected';
  const isComposerDisabled = Boolean(disabled) || isSessionReady === false || isSocketReady === false || isIntakeLocked;
  const attachmentCount = uploadingFiles.length + previewFiles.length;
  const shouldWrapAttachments = attachmentCount > 4;
  const maxTextareaHeight = isCompactViewport ? MOBILE_MAX_TEXTAREA_HEIGHT : MAX_TEXTAREA_HEIGHT;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const apply = () => {
      setIsCompactViewport(mediaQuery.matches);
    };
    apply();
    mediaQuery.addEventListener('change', apply);
    return () => {
      mediaQuery.removeEventListener('change', apply);
    };
  }, []);

  const resizeTextarea = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    const scrollHeight = element.scrollHeight;
    const nextHeight = Math.min(maxTextareaHeight, Math.max(MIN_TEXTAREA_HEIGHT, scrollHeight));
    const canScroll = scrollHeight > maxTextareaHeight;

    element.style.height = `${nextHeight}px`;
    element.style.overflowY = canScroll ? 'auto' : 'hidden';

    setIsInputExpanded(nextHeight > MIN_TEXTAREA_HEIGHT + 8);
    setIsTextareaScrollable(canScroll);
    setShowScrollFade(canScroll && element.scrollTop > 0);
  }, [maxTextareaHeight]);

  const handleInput = (e: Event & { currentTarget: HTMLTextAreaElement }) => {
    const element = e.currentTarget;
    setInputValue(element.value);
    resizeTextarea(element);
  };

  const handleTextareaScroll = (e: Event & { currentTarget: HTMLTextAreaElement }) => {
    if (!isTextareaScrollable) {
      setShowScrollFade(false);
      return;
    }
    setShowScrollFade(e.currentTarget.scrollTop > 0);
  };

  const handleSubmit = () => {
    if (!inputValue.trim() && previewFiles.length === 0) return;
    if (isComposerDisabled) return;
    onSubmit();
    const el = textareaRef.current;
    if (el) {
      el.style.height = '';
      el.style.overflowY = 'hidden';
    }
    setIsInputExpanded(false);
    setIsTextareaScrollable(false);
    setShowScrollFade(false);
  };

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    resizeTextarea(el);
  }, [inputValue, resizeTextarea, textareaRef]);

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
  const isOverSoftLimit = inputValue.length >= SOFT_CHAR_LIMIT;
  const isOverHardWarnLimit = inputValue.length >= HARD_WARN_LIMIT;

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
            <div
              className={`message-composer-preview-container ${shouldWrapAttachments ? 'flex-wrap max-h-[104px] overflow-y-auto pr-1' : 'overflow-x-auto'}`}
              role="list"
              aria-label="File attachments"
            >
              {/* Uploading files - newest first */}
              {uploadingFiles.slice().reverse().map(file => (
                <FileUploadStatus
                  key={file.id}
                  file={file}
                  onCancel={() => cancelUpload(file.id)}
                  className="shadow-none border-0 ring-0"
                />
              ))}
              
              {/* Preview files - newest first */}
              {previewFiles.slice().reverse().map((file, index) => (
                <FileDisplay
                  key={file.url || `${file.name}-${index}`}
                  file={file}
                  status="preview"
                  onRemove={() => removePreviewFile(previewFiles.length - 1 - index)}
                  className="shadow-none border-0 ring-0"
                />
              ))}
            </div>
          )}

          <div className="message-composer-input-row">
            {!hideAttachmentControls && !isRecording && (
              <div className="flex-shrink-0 self-end">
                <FileMenu
                  onFileSelect={handleFileSelect}
                  onCameraCapture={handleCameraCapture}
                  isReadyToUpload={isComposerDisabled ? false : isReadyToUpload}
                />
              </div>
            )}

            <div className={`relative flex-1 flex items-end gap-2 glass-input min-h-12 ${isInputExpanded ? 'rounded-2xl py-2 px-3.5' : 'rounded-full py-1 px-3'} ${isInputFocused ? 'ring-2 ring-accent-500/40 border-accent-500/40' : ''}`}>
              {showScrollFade && (
                <div className="pointer-events-none absolute left-3 right-12 top-2 h-4 bg-gradient-to-b from-black/20 to-transparent" />
              )}
              <textarea
                ref={textareaRef}
                data-testid="message-input"
                className="w-full min-h-8 py-2 m-0 text-sm sm:text-base leading-[1.45] text-input-text bg-transparent border-none resize-none outline-none overflow-hidden box-border placeholder:text-input-placeholder"
                placeholder="Type a message..."
                rows={1}
                value={inputValue}
                onInput={handleInput}
                onScroll={handleTextareaScroll}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
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
                className={`w-8 h-8 p-0 rounded-full shrink-0 ${isInputExpanded ? 'self-end' : 'self-center'} transition ${isInputFocused && !sendDisabled ? 'ring-2 ring-accent-500/50 shadow-[0_0_0_2px_rgba(255,196,0,0.15)]' : ''}`}
                icon={<ArrowUpIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                data-testid="message-send-button"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 self-end">
              {!hideMediaControls && features.enableAudioRecording && (
                <MediaControls onMediaCapture={handleMediaCapture} onRecordingStateChange={setIsRecording} />
              )}
            </div>
          </div>

        </div>

        {showStatusMessage && (
          <div className="space-y-1 py-1 opacity-80">
            <div className="text-xs text-input-text/70 text-center">
              {statusMessage}
            </div>
            <div className="flex items-center justify-between text-[11px] text-input-text/60">
              <span>Enter to send, Shift+Enter for a new line</span>
              <span className={isOverHardWarnLimit ? 'text-red-400' : isOverSoftLimit ? 'text-amber-400' : ''}>
                {inputValue.length}
              </span>
            </div>
          </div>
        )}
      </form>
      {footerActions}
    </div>
  );
};

export default MessageComposer;
