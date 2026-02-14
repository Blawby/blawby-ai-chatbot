import type { JSX } from 'preact';
import { CheckCircleIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import {
  EyeIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { useCallback, useState } from 'preact/hooks';
import { MarkdownUploadTextarea } from '@/shared/ui/input';

export type TimelinePerson = {
  name: string;
  imageUrl?: string | null;
};

export type TimelineItem = {
  id: string;
  type: 'created' | 'edited' | 'sent' | 'commented' | 'viewed' | 'paid';
  person: TimelinePerson;
  date: string;
  dateTime?: string;
  comment?: string;
  action?: string;
  actionMeta?: {
    type: 'status_change';
    from: string;
    to: string;
  };
};

export interface ActivityTimelineProps {
  items: TimelineItem[];
  className?: string;
  showComposer?: boolean;
  composerDisabled?: boolean;
  composerSubmitting?: boolean;
  composerPlaceholder?: string;
  composerLabel?: string;
  composerValue?: string;
  composerPerson?: TimelinePerson;
  composerPracticeId?: string | null;
  composerConversationId?: string;
  onComposerChange?: (value: string) => void;
  onComposerSubmit?: (value: string) => void | Promise<void>;
  onEditComment?: (id: string, value: string) => void | Promise<void>;
  onDeleteComment?: (id: string) => void | Promise<void>;
  commentActionsDisabled?: boolean;
}

const DEFAULT_ACTIONS: Record<TimelineItem['type'], string> = {
  created: 'created the record.',
  edited: 'edited the record.',
  sent: 'sent the invoice.',
  commented: 'commented.',
  viewed: 'viewed the invoice.',
  paid: 'paid the invoice.'
};

const TYPE_ICONS: Partial<Record<TimelineItem['type'], (props: { className?: string }) => JSX.Element>> = {
  created: (props) => <PlusCircleIcon {...props} />,
  edited: (props) => <PencilSquareIcon {...props} />,
  sent: (props) => <PaperAirplaneIcon {...props} />,
  viewed: (props) => <EyeIcon {...props} />
};

export const ActivityTimeline = ({
  items,
  className = '',
  showComposer = false,
  composerDisabled = true,
  composerSubmitting = false,
  composerPlaceholder = 'Add your comment...',
  composerLabel = 'Comment',
  composerValue,
  composerPerson,
  composerPracticeId,
  composerConversationId,
  onComposerChange,
  onComposerSubmit,
  onEditComment,
  onDeleteComment,
  commentActionsDisabled = false
}: ActivityTimelineProps) => {
  const isControlled = typeof composerValue === 'string';
  const [draft, setDraft] = useState('');
  const resolvedValue = isControlled ? composerValue : draft;
  const isSubmitDisabled = composerDisabled || composerSubmitting || resolvedValue.trim().length === 0;

  const handleChange = useCallback((nextValue: string) => {
    if (!isControlled) {
      setDraft(nextValue);
    }
    onComposerChange?.(nextValue);
  }, [isControlled, onComposerChange]);

  const handleSubmit = useCallback(async (event: Event) => {
    event.preventDefault();
    if (composerDisabled || composerSubmitting) return;
    const trimmed = resolvedValue.trim();
    if (!trimmed) return;
    await onComposerSubmit?.(trimmed);
    if (!isControlled) {
      setDraft('');
    }
  }, [composerDisabled, composerSubmitting, isControlled, onComposerSubmit, resolvedValue]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [actionInFlightId, setActionInFlightId] = useState<string | null>(null);

  const startEdit = useCallback((id: string, currentValue?: string) => {
    setEditingId(id);
    setEditValue(currentValue ?? '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingId || !onEditComment) return;
    const nextValue = editValue.trim();
    if (!nextValue) return;
    setActionInFlightId(editingId);
    try {
      await onEditComment(editingId, nextValue);
      cancelEdit();
    } finally {
      setActionInFlightId(null);
    }
  }, [cancelEdit, editValue, editingId, onEditComment]);

  const handleDelete = useCallback(async (id: string) => {
    if (!onDeleteComment) return;
    setActionInFlightId(id);
    try {
      await onDeleteComment(id);
    } finally {
      setActionInFlightId(null);
    }
  }, [onDeleteComment]);

  return (
    <div className={cn('space-y-6', className)}>
    <ul className="space-y-6">
      {items.map((item, itemIndex) => {
        const isLast = itemIndex === items.length - 1;
        const actionText = item.action ?? DEFAULT_ACTIONS[item.type];

        return (
          <li key={item.id} className="relative flex gap-x-4">
            <div className="relative flex w-10 flex-none justify-center pt-0.5">
              <div
                className={cn(
                  'absolute left-1/2 z-0 w-px -translate-x-1/2 bg-line-default',
                  isLast ? 'h-6' : '-bottom-6',
                  'top-0'
                )}
              />
              {item.type === 'commented' ? (
                <div className="relative z-10 flex h-10 w-10 items-center justify-center">
                  <Avatar
                    name={item.person.name}
                    src={item.person.imageUrl}
                    size="md"
                    className="ring-1 ring-black/10 bg-white/10 text-input-text dark:ring-white/20"
                  />
                  <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-overlay text-input-text ring-1 ring-line-glass/30 shadow-sm">
                    <ChatBubbleLeftRightIcon className="h-3 w-3" aria-hidden="true" />
                  </span>
                </div>
              ) : (
                <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-input-text ring-1 ring-line-glass/30 shadow-sm">
                  {item.type === 'paid' ? (
                    <CheckCircleIcon aria-hidden="true" className="h-5 w-5 text-emerald-500" />
                  ) : TYPE_ICONS[item.type] ? (
                    (() => {
                      const Icon = TYPE_ICONS[item.type];
                      return Icon ? (
                        <Icon className="h-4 w-4 text-input-placeholder dark:text-gray-200" />
                      ) : null;
                    })()
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-input-placeholder/80" />
                  )}
                </div>
              )}
            </div>

            {item.type === 'commented' ? (
              <>
                <div className="flex-auto">
                  <div className="text-sm leading-5 text-gray-500 dark:text-gray-400">
                    <div className="font-semibold text-input-text">{item.person.name}</div>
                    <time dateTime={item.dateTime ?? item.date}>Commented {item.date}</time>
                  </div>
                  {editingId === item.id ? (
                    <div className="mt-2 space-y-2">
                      <MarkdownUploadTextarea
                        showLabel={false}
                        showTabs={false}
                        value={editValue}
                        onChange={(next) => setEditValue(next)}
                        placeholder="Edit comment..."
                        rows={3}
                        maxLength={5000}
                        practiceId={composerPracticeId}
                        conversationId={composerConversationId}
                        disabled={commentActionsDisabled || actionInFlightId === item.id}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="primary"
                          onClick={submitEdit}
                          disabled={commentActionsDisabled || actionInFlightId === item.id || editValue.trim().length === 0}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={cancelEdit}
                          disabled={commentActionsDisabled || actionInFlightId === item.id}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {item.comment && (
                        <p className="mt-2 text-sm leading-6 text-input-text">
                          {item.comment}
                        </p>
                      )}
                      {(onEditComment || onDeleteComment) && (
                        <div className="mt-2 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                          {onEditComment && (
                            <button
                              type="button"
                              onClick={() => startEdit(item.id, item.comment)}
                              disabled={commentActionsDisabled || actionInFlightId === item.id}
                              className={cn(
                                'hover:text-input-text',
                                (commentActionsDisabled || actionInFlightId === item.id) && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              Edit
                            </button>
                          )}
                          {onDeleteComment && (
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              disabled={commentActionsDisabled || actionInFlightId === item.id}
                              className={cn(
                                'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300',
                                (commentActionsDisabled || actionInFlightId === item.id) && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="flex-auto py-0.5 text-sm leading-5 text-input-text">
                  <span className="font-semibold">{item.person.name}</span>{' '}
                  {item.actionMeta?.type === 'status_change' ? (
                    <>
                      <span className="text-gray-500 dark:text-gray-400">updated the status</span>{' '}
                      <span className="text-gray-500 dark:text-gray-400">from</span>{' '}
                      <span className="font-semibold text-input-text">{item.actionMeta.from}</span>{' '}
                      <span className="text-gray-500 dark:text-gray-400">to</span>{' '}
                      <span className="font-semibold text-input-text">{item.actionMeta.to}</span>
                    </>
                  ) : (
                    (() => {
                      const trimmed = actionText.trim();
                      const match = trimmed.match(/^([\w-]+)\s+(.*)$/);
                      if (!match) {
                        return <span className="text-input-text">{trimmed}</span>;
                      }
                      const [, verb, rest] = match;
                      return (
                        <>
                          <span className="text-gray-500 dark:text-gray-400">{verb}</span>{' '}
                          <span className="text-input-text">{rest}</span>
                        </>
                      );
                    })()
                  )}
                </p>
                <time
                  dateTime={item.dateTime ?? item.date}
                  className="flex-none py-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400"
                >
                  {item.date}
                </time>
              </>
            )}
          </li>
        );
      })}
    </ul>

    {showComposer && (
      <div className="flex gap-x-3">
        <Avatar
          name={composerPerson?.name ?? 'You'}
          src={composerPerson?.imageUrl ?? null}
          size="sm"
          className="mt-1 ring-1 ring-white/15 bg-white/10 text-input-text dark:ring-white/10"
        />
        <form className="flex-auto space-y-2" onSubmit={handleSubmit}>
          <MarkdownUploadTextarea
            showLabel={false}
            value={resolvedValue}
            onChange={handleChange}
            placeholder={composerPlaceholder}
            rows={3}
            maxLength={5000}
            practiceId={composerPracticeId}
            conversationId={composerConversationId}
            disabled={composerDisabled || composerSubmitting}
          />
          <div className="flex items-center justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="rounded-full px-4 py-1.5"
              disabled={isSubmitDisabled}
            >
              {composerLabel}
            </Button>
          </div>
        </form>
      </div>
    )}
    </div>
  );
};
