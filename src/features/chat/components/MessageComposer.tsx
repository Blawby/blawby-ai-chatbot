import type { RefObject } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import FileMenu from '@/features/media/components/FileMenu';
import MediaControls from '@/features/media/components/MediaControls';
import { FileDisplay } from '@/shared/ui/upload/organisms/FileDisplay';
import { FileUploadStatus } from '@/shared/ui/upload/molecules/FileUploadStatus';
import { ArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { features } from '@/config/features';
import { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import { Trans } from '@/shared/i18n/hooks';
import type { ReplyTarget } from '@/features/chat/types';
import { useTranslation } from 'react-i18next';

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
    paymentRequired?: boolean;
    paymentReceived?: boolean;
  };
  disabled?: boolean;
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
  footerActions?: preact.ComponentChildren;
  hideAttachmentControls?: boolean;
  hideMediaControls?: boolean;
  mentionCandidates?: Array<{
    userId: string;
    name: string;
    email?: string;
  }>;
}

const MIN_TEXTAREA_HEIGHT = 32;
const MAX_TEXTAREA_HEIGHT = 144;
const MOBILE_MAX_TEXTAREA_HEIGHT = 112;

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
  footerActions,
  hideAttachmentControls = false,
  hideMediaControls = false,
  mentionCandidates = [],
}: MessageComposerProps) => {
  const { t } = useTranslation('common');
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isTextareaScrollable, setIsTextareaScrollable] = useState(false);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionFocusIndex, setMentionFocusIndex] = useState(0);
  const [selectedMentionUserIds, setSelectedMentionUserIds] = useState<string[]>([]);
  const highlighterRef = useRef<HTMLDivElement>(null);
  const getMentionLabel = useCallback((candidate: { name: string }) => candidate.name.trim(), []);

  const intakeStep = intakeStatus?.step;
  const isIntakeLocked =
    intakeStep === 'pending_review' ||
    intakeStep === 'accepted' ||
    intakeStep === 'rejected';
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

    setIsInputExpanded(nextHeight > MIN_TEXTAREA_HEIGHT + 8);
    setIsTextareaScrollable(canScroll);
    setShowScrollFade(canScroll && element.scrollTop > 0);
  }, [maxTextareaHeight]);

  const handleInput = (e: Event & { currentTarget: HTMLTextAreaElement }) => {
    const element = e.currentTarget;
    setInputValue(element.value);
    resizeTextarea(element);
    const caretIndex = element.selectionStart ?? element.value.length;
    refreshMentionMenu(element.value, caretIndex);
    
    // Sync scroll to highlighter
    if (highlighterRef.current) {
      highlighterRef.current.scrollTop = element.scrollTop;
    }
  };

  const handleTextareaScroll = (e: Event & { currentTarget: HTMLTextAreaElement }) => {
    if (highlighterRef.current) {
      highlighterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    if (!isTextareaScrollable) {
      setShowScrollFade(false);
      return;
    }
    setShowScrollFade(e.currentTarget.scrollTop > 0);
  };

  const handleSubmit = () => {
    if (!inputValue.trim() && previewFiles.length === 0) return;
    if (isComposerDisabled) return;

    // Validate and sanitize selectedMentionUserIds before sending
    const sanitizedMentionIds = selectedMentionUserIds.filter(id => {
      const candidate = mentionCandidates.find(c => c.userId === id);
      if (!candidate) return false;
      const label = getMentionLabel(candidate);
      if (!label) return false;
      // Use a more robust check that handles multi-word names and word boundaries
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|\\s)@${escapedLabel}(?:\\s|$)`);
      return regex.test(inputValue);
    });

    onSubmit(sanitizedMentionIds.length > 0 ? sanitizedMentionIds : undefined);
    const el = textareaRef.current;
    if (el) {
      el.style.height = '';
      el.style.overflowY = 'hidden';
    }
    setIsInputExpanded(false);
    setIsTextareaScrollable(false);
    setShowScrollFade(false);
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
  }, [closeMentionMenu, filteredMentionCandidates, getMentionLabel, inputValue, mentionStartIndex, resizeTextarea, setInputValue, textareaRef]);

  const highlightedContent = useMemo(() => {
    if (!inputValue) return null;
    
    const candidates = mentionCandidates?.map((candidate) => getMentionLabel(candidate)).filter(Boolean) ?? [];
    if (candidates.length === 0) {
      return <span className="text-transparent">{inputValue}</span>;
    }

    const escapedLabels = candidates.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(^|\\s)(@(?:${escapedLabels.join('|')}))(?=\\s|$)`, 'g');
    
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(inputValue)) !== null) {
      const prefix = match[1];
      const mention = match[2];
      const index = match.index + prefix.length;
      
      parts.push(<span key={`text-${index}`} className="text-transparent">{inputValue.slice(lastIndex, index)}</span>);
      parts.push(
        <span key={`mention-${index}`} className="nav-item-active rounded-[6px] px-0.5 ring-1 ring-accent-400/25 text-transparent">
          {mention}
        </span>
      );
      lastIndex = index + mention.length;
    }
    parts.push(<span key={`final-${lastIndex}`} className="text-transparent">{inputValue.slice(lastIndex)}</span>);
    
    return parts;
  }, [getMentionLabel, inputValue, mentionCandidates]);

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

  const textareaClasses = "w-full min-h-8 py-2 m-0 text-sm sm:text-base leading-[1.45] text-input-text bg-transparent border-none resize-none outline-none overflow-hidden box-border placeholder:text-input-placeholder transition-all duration-200";

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
                icon={XMarkIcon} iconClassName="h-4 w-4"
              />
            </div>
          )}
          {(uploadingFiles.length > 0 || previewFiles.length > 0) && (
            <div
              className={`message-composer-preview-container ${shouldWrapAttachments ? 'flex-wrap max-h-[104px] overflow-y-auto pr-1' : 'overflow-x-auto'}`}
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

          <div className="message-composer-input-row">
            {!hideAttachmentControls && !isRecording && (
              <div className="col-start-1 flex-shrink-0 self-end">
                <FileMenu
                  onFileSelect={handleFileSelect}
                  onCameraCapture={handleCameraCapture}
                  isReadyToUpload={isComposerDisabled ? false : isReadyToUpload}
                />
              </div>
            )}

            <div className={`col-start-2 min-w-0 relative flex flex-1 items-end gap-2 glass-input min-h-12 ${isInputExpanded ? 'rounded-2xl py-2 px-3.5' : 'rounded-full py-1 px-3'} ${isInputFocused ? 'ring-2 ring-accent-500/40 border-accent-500/40' : ''}`}>
              {showScrollFade && (
                <div className="pointer-events-none absolute left-3 right-12 top-2 h-4 bg-gradient-to-b from-black/20 to-transparent z-10" />
              )}
              <div className="relative flex-1 min-w-0 self-stretch flex items-center">
                <div 
                  ref={highlighterRef}
                  className={`${textareaClasses} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border-none select-none`}
                  aria-hidden="true"
                  style={{ color: 'transparent' }}
                >
                  {highlightedContent}
                </div>
                <textarea
                  ref={textareaRef}
                  data-testid="message-input"
                  className={`${textareaClasses} relative z-0`}
                  placeholder={t('forms.placeholders.message')}
                  rows={1}
                  value={inputValue}
                  onInput={handleInput}
                  onScroll={handleTextareaScroll}
                  onClick={(event) => {
                    const element = event.currentTarget;
                    const caretIndex = element.selectionStart ?? element.value.length;
                    refreshMentionMenu(element.value, caretIndex);
                  }}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => {
                    setIsInputFocused(false);
                    setTimeout(() => closeMentionMenu(), 80);
                  }}
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
                    
                    // Validate and sanitize selectedMentionUserIds before forwarding
                    const sanitizedMentionIds = selectedMentionUserIds.filter(id => {
                      const candidate = mentionCandidates.find(c => c.userId === id);
                      if (!candidate) return false;
                      const label = getMentionLabel(candidate);
                      if (!label) return false;
                      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const regex = new RegExp(`(^|\\s)@${escapedLabel}(?:\\s|$)`);
                      return regex.test(inputValue);
                    });
                    
                    onKeyDown(event, sanitizedMentionIds);
                  }}
                  aria-label="Message input"
                  aria-expanded={mentionMenuOpen}
                  aria-controls={mentionMenuOpen ? "mention-listbox" : undefined}
                  aria-activedescendant={mentionMenuOpen ? `mention-option-${mentionFocusIndex}` : undefined}
                  disabled={isComposerDisabled}
                  style={{ background: 'transparent' }}
                />
              </div>
              {mentionMenuOpen && filteredMentionCandidates.length > 0 ? (
                <div 
                  id="mention-listbox"
                  role="listbox"
                  className="absolute bottom-full left-2 right-2 z-40 mb-2 overflow-hidden rounded-xl border border-white/10 bg-surface-overlay/95 shadow-glass backdrop-blur-2xl"
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
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                          index === mentionFocusIndex
                            ? 'bg-accent-500/15 text-accent-400'
                            : 'text-input-text hover:bg-white/[0.08]'
                        }`}
                      >
                        <span className="truncate">{candidate.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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
                icon={ArrowUpIcon} iconClassName="w-3.5 h-3.5"
                data-testid="message-send-button"
              />
            </div>

            <div className="col-start-3 flex items-center gap-2 flex-shrink-0 self-end">
              {!hideMediaControls && features.enableAudioRecording && (
                <MediaControls onMediaCapture={handleMediaCapture} onRecordingStateChange={setIsRecording} />
              )}
            </div>
          </div>

        </div>

      </form>
      {footerActions}
    </div>
  );
};

export default MessageComposer;
