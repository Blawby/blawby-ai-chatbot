import { type FunctionComponent } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { X } from 'lucide-preact';
import { Avatar } from '@/shared/ui/profile';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption } from '@/shared/ui/input/Combobox';
import { cn } from '@/shared/utils/cn';
import MessageComposer from '@/features/chat/components/MessageComposer';
import { usePresenceContext } from '@/shared/contexts/PresenceContext';
import type { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';

export type DraftContact =
  | { kind: 'user'; userId: string; name: string; email?: string }
  | { kind: 'practice_assistant' }
  | null;

interface DraftConversationViewProps {
  contactOptions: ComboboxOption[];
  pendingInviteOptions?: ComboboxOption[];
  isLoadingContacts?: boolean;
  draftContact: DraftContact;
  onChangeContact: (next: DraftContact) => void;
  onSendFirstMessage: (message: string, attachments: FileAttachment[]) => Promise<void>;
  onCancel: () => void;
  onInviteContact?: () => void;
  onClickPendingInvite?: (option: ComboboxOption) => void;
  /** File upload state (lifted from MainApp's useFileUpload). The draft
   *  composer reuses the same pipeline + preview state as the main chat
   *  composer, so drag-and-drop and image previews work identically. */
  fileUploadProps?: {
    previewFiles: FileAttachment[];
    uploadingFiles: UploadingFile[];
    isReadyToUpload: boolean;
    handleFileSelect: (files: File[]) => Promise<unknown>;
    handleCameraCapture: (file: File) => Promise<void>;
    removePreviewFile: (index: number) => void;
    clearPreviewFiles: () => void;
    cancelUpload: (fileId: string) => void;
    handleMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
    isRecording: boolean;
    setIsRecording: (recording: boolean) => void;
  };
}

/**
 * Draft conversation view — shown after the user clicks "New message" but
 * before any conversation has been persisted. Picks a contact via the
 * embedded Combobox; the first message send is what actually creates the
 * conversation in D1, hands the user off to the real conversation thread.
 */
export const DraftConversationView: FunctionComponent<DraftConversationViewProps> = ({
  contactOptions,
  pendingInviteOptions = [],
  isLoadingContacts = false,
  draftContact,
  onChangeContact,
  onSendFirstMessage,
  onCancel,
  onInviteContact,
  onClickPendingInvite,
  fileUploadProps,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  // Use a ref to avoid TOCTOU race on isSending
  const sendingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Real presence — option values are userIds for clients/team rows. Pending
  // invites use a `__pending__:` prefix and can't be online.
  const { onlineUserIds } = usePresenceContext();

  // Pending-invite rows are tagged with `__pending__` in the option value so
  // we can intercept onChange and route to the invite-confirmation path
  // instead of treating them as a real selection.
  const allOptions = useMemo<ComboboxOption[]>(() => {
    if (pendingInviteOptions.length === 0) return contactOptions;
    return [
      ...contactOptions,
      ...pendingInviteOptions.map((option) => ({
        ...option,
        value: `__pending__:${option.value}`,
        disabled: false,
        meta: option.meta ?? 'Invite pending — waiting for accept',
        description: option.description ?? 'Pending invite',
      })),
    ];
  }, [contactOptions, pendingInviteOptions]);

  const handlePickContact = (rawValue: string) => {
    if (!rawValue) {
      onChangeContact(null);
      return;
    }
    if (rawValue === '__blawby_ai__') {
      onChangeContact({ kind: 'practice_assistant' });
      return;
    }
    if (rawValue.startsWith('__pending__:')) {
      const realValue = rawValue.slice('__pending__:'.length);
      const option = pendingInviteOptions.find((opt) => opt.value === realValue);
      if (option && onClickPendingInvite) onClickPendingInvite(option);
      return;
    }
    const option = contactOptions.find((opt) => opt.value === rawValue);
    if (!option) return;
    onChangeContact({
      kind: 'user',
      userId: option.value,
      name: option.label,
      email: typeof option.meta === 'string' ? option.meta : undefined,
    });
  };

  const handleComposerSubmit = async () => {
    if (!draftContact) return;
    const trimmed = inputValue.trim();
    const attachments = fileUploadProps?.previewFiles ?? [];
    if (!trimmed && attachments.length === 0) return;
    if (sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    try {
      await onSendFirstMessage(trimmed, attachments);
      setInputValue('');
      fileUploadProps?.clearPreviewFiles();
    } catch (err) {
      // Optionally show user feedback or log
      console.error('Failed to send first message', err);
      // Optionally: show error to user here
    } finally {
      setIsSending(false);
      sendingRef.current = false;
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleComposerSubmit();
    }
  };

  const composerDisabled = draftContact === null || isSending;
  const isPracticeAssistant = draftContact?.kind === 'practice_assistant';
  const displayName = isPracticeAssistant ? 'Blawby AI' : (draftContact?.kind === 'user' ? draftContact.name : null);
  const comboboxValue = isPracticeAssistant ? '__blawby_ai__' : (draftContact?.kind === 'user' ? draftContact.userId : '');

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-workspace">
      <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar
            src={null}
            name={displayName ?? 'New conversation'}
            size="md"
            className="ring-1 ring-line-subtle"
            status={draftContact?.kind === 'user'
              ? (onlineUserIds.has(draftContact.userId) ? 'active' : 'offline')
              : undefined}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs uppercase tracking-wide text-dim-2">
              New conversation
            </span>
            <span className="truncate text-sm font-semibold text-ink">
              {displayName ?? 'Pick a contact below to begin'}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="icon"
          size="icon-sm"
          onClick={onCancel}
          icon={X}
          iconClassName="h-4 w-4"
          aria-label="Cancel new conversation"
        />
      </header>

      <div className="border-b border-line-subtle px-4 py-3 sm:px-6">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-dim-2">
          To
        </span>
        <Combobox
          value={comboboxValue}
          onChange={handlePickContact}
          options={allOptions}
          searchable
          placeholder={isLoadingContacts ? 'Loading contacts…' : 'Search clients and team…'}
          optionLeading={(option) => {
            const isAi = option.value === '__blawby_ai__';
            const isPending = option.value.startsWith('__pending__:');
            const isOnline = !isAi && !isPending && onlineUserIds.has(option.value);
            return (
              <Avatar
                src={null}
                name={option.label}
                size="sm"
                status={isAi || isPending ? undefined : isOnline ? 'active' : 'offline'}
              />
            );
          }}
          optionMeta={(option) =>
            typeof option.meta === 'string'
              ? option.meta
              : typeof option.description === 'string'
                ? option.description
                : ''
          }
          footer={onInviteContact ? (close) => (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                close();
                onInviteContact();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                'text-ink hover:bg-surface-utility/10 focus-visible:bg-surface-utility/10',
              )}
            >
              <span className="text-accent-utility">+ Invite a new contact</span>
            </button>
          ) : undefined}
        />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-sm text-center">
          <p className="text-sm text-ink">
            {isPracticeAssistant
              ? 'What would you like to work on?'
              : draftContact?.kind === 'user'
                ? `Type a message to ${draftContact.name} below to start the conversation.`
                : 'Pick a contact above, then write the first message.'}
          </p>
          {!isPracticeAssistant ? (
            <p className="mt-1 text-xs text-dim-2">
              The conversation is created when you send the first message.
            </p>
          ) : null}
        </div>
      </div>

      {fileUploadProps ? (
        <MessageComposer
          inputValue={inputValue}
          setInputValue={setInputValue}
          previewFiles={fileUploadProps.previewFiles}
          uploadingFiles={fileUploadProps.uploadingFiles}
          removePreviewFile={fileUploadProps.removePreviewFile}
          handleFileSelect={fileUploadProps.handleFileSelect}
          handleCameraCapture={fileUploadProps.handleCameraCapture}
          cancelUpload={fileUploadProps.cancelUpload}
          isRecording={fileUploadProps.isRecording}
          handleMediaCapture={fileUploadProps.handleMediaCapture}
          setIsRecording={fileUploadProps.setIsRecording}
          onSubmit={() => { void handleComposerSubmit(); }}
          onKeyDown={handleComposerKeyDown}
          textareaRef={textareaRef}
          isReadyToUpload={fileUploadProps.isReadyToUpload}
          isSessionReady
          isSocketReady
          disabled={composerDisabled}
        />
      ) : null}
    </div>
  );
};

export default DraftConversationView;
