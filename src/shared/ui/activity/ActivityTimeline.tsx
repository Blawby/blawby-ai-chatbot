import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { FaceSmileIcon, PaperClipIcon } from '@heroicons/react/20/solid';
import { Avatar } from '@/shared/ui/profile';
import { cn } from '@/shared/utils/cn';
import { useCallback, useState } from 'preact/hooks';

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

export const ActivityTimeline = ({
  items,
  className = '',
  showComposer = false,
  composerDisabled = true,
  composerSubmitting = false,
  composerPlaceholder = 'Add your comment...',
  composerLabel = 'Comment',
  composerValue,
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

  const handleChange = useCallback((event: Event) => {
    const target = event.currentTarget as HTMLTextAreaElement;
    const nextValue = target?.value ?? '';
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
            <div
              className={cn(
                isLast ? 'h-6' : '-bottom-6',
                'absolute top-0 left-0 flex w-6 justify-center'
              )}
            >
              <div className="w-px bg-gray-200 dark:bg-white/15" />
            </div>

            {item.type === 'commented' ? (
              <>
                <Avatar
                  name={item.person.name}
                  src={item.person.imageUrl}
                  size="sm"
                  className="mt-3 ring-0 outline -outline-offset-1 outline-black/5 bg-gray-50 text-gray-700 dark:bg-gray-800 dark:outline-white/10"
                />
                <div className="flex-auto rounded-md p-3 ring-1 ring-gray-200 ring-inset dark:ring-white/15">
                  <div className="flex justify-between gap-x-4">
                    <div className="py-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-900 dark:text-white">{item.person.name}</span> commented
                    </div>
                    <time
                      dateTime={item.dateTime ?? item.date}
                      className="flex-none py-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400"
                    >
                      {item.date}
                    </time>
                  </div>
                  {editingId === item.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={3}
                        value={editValue}
                        onInput={(event) => {
                          const target = event.currentTarget as HTMLTextAreaElement;
                          setEditValue(target?.value ?? '');
                        }}
                        className="block w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-accent-500 dark:border-white/15 dark:bg-dark-card-bg dark:text-white"
                        disabled={commentActionsDisabled || actionInFlightId === item.id}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={submitEdit}
                          disabled={commentActionsDisabled || actionInFlightId === item.id || editValue.trim().length === 0}
                          className={cn(
                            'rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white',
                            'hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={commentActionsDisabled || actionInFlightId === item.id}
                          className={cn(
                            'rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700',
                            'hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/10'
                          )}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {item.comment && (
                        <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
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
                                'hover:text-gray-900 dark:hover:text-white',
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
                <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-white dark:bg-gray-900">
                  {item.type === 'paid' ? (
                    <CheckCircleIcon aria-hidden="true" className="h-6 w-6 text-accent-500" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-100 ring ring-gray-300 dark:bg-white/10 dark:ring-white/20" />
                  )}
                </div>
                <p className="flex-auto py-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-white">{item.person.name}</span> {actionText}
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
          name="You"
          size="sm"
          className="mt-1 ring-0 outline -outline-offset-1 outline-black/5 bg-gray-50 text-gray-700 dark:bg-gray-800 dark:outline-white/10"
        />
        <form className="relative flex-auto" onSubmit={handleSubmit}>
          <div className="overflow-hidden rounded-lg pb-12 outline outline-1 -outline-offset-1 outline-gray-300 dark:bg-white/5 dark:outline-white/10 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent-500">
            <label htmlFor="timeline-comment" className="sr-only">
              Add your comment
            </label>
            <textarea
              id="timeline-comment"
              name="comment"
              rows={2}
              placeholder={composerPlaceholder}
              disabled={composerDisabled || composerSubmitting}
              className="block w-full resize-none bg-transparent px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-sm leading-6 dark:text-white dark:placeholder:text-gray-500"
              value={resolvedValue}
              onInput={handleChange}
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between py-2 pr-2 pl-3">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                disabled={composerDisabled || composerSubmitting}
                className={cn(
                  '-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500',
                  'dark:text-gray-500 dark:hover:text-white',
                  (composerDisabled || composerSubmitting) && 'opacity-60 cursor-not-allowed'
                )}
                aria-label="Attach a file"
              >
                <PaperClipIcon aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                disabled={composerDisabled || composerSubmitting}
                className={cn(
                  '-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500',
                  'dark:text-gray-500 dark:hover:text-white',
                  (composerDisabled || composerSubmitting) && 'opacity-60 cursor-not-allowed'
                )}
                aria-label="Add a mood"
              >
                <FaceSmileIcon aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={cn(
                'rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300',
                'hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:ring-white/10 dark:hover:bg-white/20',
                isSubmitDisabled && 'opacity-60 cursor-not-allowed'
              )}
            >
              {composerLabel}
            </button>
          </div>
        </form>
      </div>
    )}
    </div>
  );
};
