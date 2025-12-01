import type { RefObject } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import { Button } from '../ui/Button';
import FileMenu from '../FileMenu';
import MediaControls from '../MediaControls';
import { FileDisplay } from '../ui/upload/organisms/FileDisplay';
import { FileUploadStatus } from '../ui/upload/molecules/FileUploadStatus';
import { ArrowUpIcon } from "@heroicons/react/24/outline";
import { features } from '../../config/features';
import { FileAttachment } from '../../../worker/types';
import type { UploadingFile } from '../../hooks/useFileUpload';

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
}: MessageComposerProps) => {
  const handleInput = (e: Event & { currentTarget: HTMLTextAreaElement }) => {
    const t = e.currentTarget;
    setInputValue(t.value);
    t.style.height = 'auto';
    t.style.height = `${Math.max(32, t.scrollHeight)}px`;
  };

  const handleSubmit = () => {
    if (!inputValue.trim() && previewFiles.length === 0) return;
    if (isSessionReady === false) return;
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
    if (isSessionReady === false) {
      return 'Setting up a secure session...';
    }
    return 'Blawby can make mistakes. Check for important information.';
  })();

  const sendDisabled = (
    (!inputValue.trim() && previewFiles.length === 0) ||
    isSessionReady === false
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
                isReadyToUpload={isSessionReady === false ? false : isReadyToUpload}
              />
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
              disabled={isSessionReady === false}
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
