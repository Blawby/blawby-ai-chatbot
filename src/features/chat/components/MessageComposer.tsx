import type { RefObject } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Composer } from '@/design-system/patterns/Composer';
import FileMenu from '@/features/media/components/FileMenu';
import MediaControls from '@/features/media/components/MediaControls';
import { FileDisplay } from '@/shared/ui/upload/organisms/FileDisplay';
import { FileUploadStatus } from '@/shared/ui/upload/molecules/FileUploadStatus';
import { ArrowUp, X } from 'lucide-preact';

import { features } from '@/config/features';
import { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';
import { Trans } from '@/shared/i18n/hooks';
import type { ReplyTarget } from '@/features/chat/types';
import { cn } from '@/shared/utils/cn';

interface MessageComposerProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  previewFiles: FileAttachment[];
  uploadingFiles: UploadingFile[];
  removePreviewFile: (index: number) => void;
  handleFileSelect: (files: File[]) => Promise<unknown>;
  handleCameraCapture: (file: File) => Promise<void>;
  cancelUpload: (fileId: string) => void;
  isRecording: boolean;
  handleMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
  setIsRecording: (recording: boolean) => void;
  onSubmit: (mentionedUserIds?: string[]) => void;
  onKeyDown: (e: KeyboardEvent, mentionedUserIds?: string[]) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  isReadyToUpload?: boolean;
  isSessionReady?: boolean;
  isSocketReady?: boolean;
  intakeStatus?: {
    step: string;
    decision?: string;
    intakeUuid?: string | null;
    submittedAt?: string | null;
    paymentRequired?: boolean;
    paymentReceived?: boolean;
  };
  disabled?: boolean;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  hideAttachmentControls?: boolean;
  isPublicWorkspace?: boolean;
  mentionCandidates?: Array<{
    userId: string;
    name: string;
    email?: string;
  }>;
  /**
   * U8: end-of-conversation marker rendered above the textarea with
   * role='alert' aria-live='assertive'. Distinct from a transient toast —
   * `hardError` indicates the intake AI failed and the practice has been
   * notified. The composer remains visually disabled. See U8 of
   * docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
   */
  hardError?: { message: string; failureReason?: string | null } | null;
}

const MIN_TEXTAREA_HEIGHT = 32;
const MAX_TEXTAREA_HEIGHT = 144;
const MOBILE_MAX_TEXTAREA_HEIGHT = 112;
const getMentionLabel = (candidate: { name: string }) => candidate.name.trim();

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
  replyTo,
  onCancelReply,
  hideAttachmentControls = false,
  isPublicWorkspace = false,
  mentionCandidates = [],
  hardError = null,
}: MessageComposerProps) => {
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionFocusIndex, setMentionFocusIndex] = useState(0);
  const [selectedMentionUserIds, setSelectedMentionUserIds] = useState<string[]>([]);
  const getSanitizedMentionIds = useCallback(() =>
    selectedMentionUserIds.filter(id => {
      const candidate = mentionCandidates.find(c => c.userId === id);
      if (!candidate) return false;
      const label = getMentionLabel(candidate);
      if (!label) return false;
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|\\s)@${escapedLabel}(?:\\s|$)`);
      return regex.test(inputValue);
    }),
  [inputValue, mentionCandidates, selectedMentionUserIds]);

  const intakeStep = intakeStatus?.step;
  const isIntakeLocked = isPublicWorkspace && (
    intakeStep === 'pending_review' ||
    intakeStep === 'rejected'
  );
  const isComposerDisabled = Boolean(disabled) || isSessionReady === false || isSocketReady === false || isIntakeLocked;
  const attachmentCount = uploadingFiles.length + previewFiles.length;
  const shouldWrapAttachments = attachmentCount > 4;
  const maxTextareaHeight = isCompactViewport ? MOBILE_MAX_TEXTAREA_HEIGHT : MAX_TEXTAREA_HEIGHT;
  const filteredMentionCandidates = useMemo(() => {
    if (!mentionMenuOpen) return [];
    const normalizedQuery = mentionQuery.trim().toLowerCase();
    const base = mentionCandidates.filter((candidate) => candidate.userId.trim().length > 0 && candidate.name.trim().length > 0);
    if (!normalizedQuery) return base.slice(0, 8);
    return base
      .filter((candidate) => {
        const name = candidate.name.toLowerCase();
        return name.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [mentionCandidates, mentionMenuOpen, mentionQuery]);

  const closeMentionMenu = useCallback(() => {
    setMentionMenuOpen(false);
    setMentionQuery('');
    setMentionStartIndex(null);
    setMentionFocusIndex(0);
  }, []);

  const refreshMentionMenu = useCallback((value: string, caretIndex: number) => {
    if (mentionCandidates.length === 0) {
      closeMentionMenu();
      return;
    }
    const beforeCursor = value.slice(0, caretIndex);
    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex < 0) {
      closeMentionMenu();
      return;
    }
    const charBefore = atIndex === 0 ? ' ' : beforeCursor[atIndex - 1];
    if (!/\s/.test(charBefore)) {
      closeMentionMenu();
      return;
    }
    const query = beforeCursor.slice(atIndex + 1);
    if (query.includes(' ') || query.includes('\n') || query.includes('\t')) {
      closeMentionMenu();
      return;
    }
    setMentionStartIndex(atIndex);
    setMentionQuery(query);
    setMentionMenuOpen(true);
    setMentionFocusIndex(0);
  }, [closeMentionMenu, mentionCandidates.length]);

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
  }, [maxTextareaHeight]);

  const handleInput = (e: Event & { currentTarget: HTMLTextAreaElement }) => {
    const element = e.currentTarget;
    setInputValue(element.value);
    resizeTextarea(element);
    const caretIndex = element.selectionStart ?? element.value.length;
    refreshMentionMenu(element.value, caretIndex);
  };

  const handleSubmit = () => {
    if (!inputValue.trim() && previewFiles.length === 0) return;
    if (isComposerDisabled) return;

    const sanitizedMentionIds = getSanitizedMentionIds();
    onSubmit(sanitizedMentionIds.length > 0 ? sanitizedMentionIds : undefined);
    const el = textareaRef.current;
    if (el) {
      el.style.height = '';
      el.style.overflowY = 'hidden';
    }
    setSelectedMentionUserIds([]);
    closeMentionMenu();
  };

  const handleMentionSelect = useCallback((index: number) => {
    const candidate = filteredMentionCandidates[index];
    const textarea = textareaRef.current;
    if (!candidate || !textarea || mentionStartIndex === null) return;

    const currentValue = inputValue;
    const caretIndex = textarea.selectionStart ?? currentValue.length;
    const beforeMention = currentValue.slice(0, mentionStartIndex);
    const afterMention = currentValue.slice(caretIndex);
    const mentionLabel = getMentionLabel(candidate);
    if (!mentionLabel) return;
    const mentionText = `@${mentionLabel} `;
    const nextValue = `${beforeMention}${mentionText}${afterMention}`;
    const nextCaret = (beforeMention + mentionText).length;

    setInputValue(nextValue);
    setSelectedMentionUserIds((prev) => {
      const next = new Set(prev);
      next.add(candidate.userId);
      return Array.from(next);
    });
    closeMentionMenu();

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
      resizeTextarea(textarea);
    });
  }, [closeMentionMenu, filteredMentionCandidates, inputValue, mentionStartIndex, resizeTextarea, setInputValue, textareaRef]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    resizeTextarea(el);
  }, [inputValue, resizeTextarea, textareaRef]);

  // Block when session is not ready or intake is awaiting review/decision
  const sendDisabled = (
    (!inputValue.trim() && previewFiles.length === 0) ||
    isComposerDisabled
  );
  // Public widget hides file upload entirely — public users cannot upload.
  // Authenticated client/practice workspaces keep the attachment menu.
  const canShowAttachmentMenu = !hideAttachmentControls && !isPublicWorkspace && !isRecording && !isComposerDisabled && Boolean(isReadyToUpload);
  const canShowAudioRecording = features.enableAudioRecording && !isPublicWorkspace && !isComposerDisabled;

  return (
    <div className="px-4 pt-3 pb-3 bg-transparent rounded-none border-0 h-auto flex flex-col w-full">
      <form
        className="w-full flex flex-col"
        aria-label="Message composition"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        {hardError && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="composer-hard-error"
            className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
          >
            {hardError.message}
          </div>
        )}
        <div className="message-composer-container">
          <Composer
            beforeInput={
              <>
                {replyTo && (
                  <div className="composer-thread-reply">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-dim">
                        <Trans
                          i18nKey="chat.replyingTo"
                          values={{ name: replyTo.authorName }}
                          components={{
                            name: <span className="truncate font-semibold text-accent" />
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
                      icon={X} iconClassName="h-4 w-4"
                    />
                  </div>
                )}
                {(uploadingFiles.length > 0 || previewFiles.length > 0) && (
                  <div
                    className={cn(
                      'message-composer-preview-container',
                      shouldWrapAttachments ? 'flex-wrap max-h-[104px] overflow-y-auto pr-1' : 'overflow-x-auto'
                    )}
                    role="list"
                    aria-label="File attachments"
                  >
                    {uploadingFiles.slice().reverse().map(file => (
                      <FileUploadStatus
                        key={file.id}
                        file={file}
                        onCancel={() => cancelUpload(file.id)}
                        className="shadow-none border-0 ring-0"
                      />
                    ))}

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
              </>
            }
            value={inputValue}
            inputMode="single-line"
            onInput={handleInput}
            onKeyDown={(event) => {
              if (mentionMenuOpen && filteredMentionCandidates.length > 0) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMentionFocusIndex((prev) => (prev + 1) % filteredMentionCandidates.length);
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setMentionFocusIndex((prev) => (prev - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
                  return;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault();
                  handleMentionSelect(mentionFocusIndex);
                  return;
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeMentionMenu();
                  return;
                }
              }

              onKeyDown(event, getSanitizedMentionIds());
            }}
            inputRef={textareaRef}
            inputAriaLabel="Message input"
            inputDisabled={isComposerDisabled}
            inputClassName="message-composer-input"
            inputProps={{
              'data-testid': 'message-input',
              onClick: (event) => {
                const element = event.currentTarget as HTMLTextAreaElement;
                const caretIndex = element.selectionStart ?? element.value.length;
                refreshMentionMenu(element.value, caretIndex);
              },
              onBlur: () => {
                setTimeout(() => closeMentionMenu(), 80);
              },
              'aria-controls': mentionMenuOpen ? 'mention-listbox' : undefined,
              'aria-activedescendant': mentionMenuOpen ? `mention-option-${mentionFocusIndex}` : undefined,
            }}
            afterInput={mentionMenuOpen && filteredMentionCandidates.length > 0 ? (
              <div
                id="mention-listbox"
                role="listbox"
                className="composer-thread-mention-menu"
              >
                <div className="max-h-56 overflow-y-auto py-1">
                  {filteredMentionCandidates.map((candidate, index) => (
                    <button
                      key={candidate.userId}
                      id={`mention-option-${index}`}
                      role="option"
                      aria-selected={index === mentionFocusIndex}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleMentionSelect(index)}
                      className={cn(
                        'composer-thread-mention-option',
                        index === mentionFocusIndex
                          ? 'composer-thread-mention-option--active'
                          : undefined
                      )}
                    >
                      <span className="truncate">{candidate.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            actions={
              <>
                {canShowAttachmentMenu && (
                  <FileMenu
                    onFileSelect={handleFileSelect}
                    onCameraCapture={handleCameraCapture}
                    isReadyToUpload
                  />
                )}
                {canShowAudioRecording ? (
                  <MediaControls onMediaCapture={handleMediaCapture} onRecordingStateChange={setIsRecording} />
                ) : null}
                <div className="composer-spacer" />
                {!isRecording ? (
                  <button
                    type="submit"
                    disabled={sendDisabled}
                    aria-label={
                      isSessionReady === false
                        ? 'Send message (waiting for secure session)'
                        : isSocketReady === false
                          ? 'Send message (connecting to chat)'
                          : (!inputValue.trim() && previewFiles.length === 0
                            ? 'Send message (disabled)'
                            : 'Send message')}
                    className="composer-send-button"
                    data-testid="message-send-button"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </>
            }
            hint={
              <span>
                <kbd>Enter</kbd> send · <kbd>Shift</kbd> <kbd>Enter</kbd> newline · Blawby never writes to your records without your approval.
              </span>
            }
          />
        </div>

      </form>
    </div>
  );
};

export default MessageComposer;
