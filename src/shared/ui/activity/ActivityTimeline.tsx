import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { FaceSmileIcon, PaperClipIcon } from '@heroicons/react/20/solid';
import { Avatar } from '@/shared/ui/profile';
import { cn } from '@/shared/utils/cn';

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
  composerPlaceholder?: string;
  composerLabel?: string;
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
  composerPlaceholder = 'Add your comment...',
  composerLabel = 'Comment'
}: ActivityTimelineProps) => (
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
                  {item.comment && (
                    <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {item.comment}
                    </p>
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
        <form className="relative flex-auto">
          <div className="overflow-hidden rounded-lg pb-12 outline outline-1 -outline-offset-1 outline-gray-300 dark:bg-white/5 dark:outline-white/10 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent-500">
            <label htmlFor="timeline-comment" className="sr-only">
              Add your comment
            </label>
            <textarea
              id="timeline-comment"
              name="comment"
              rows={2}
              placeholder={composerPlaceholder}
              disabled={composerDisabled}
              className="block w-full resize-none bg-transparent px-3 py-1.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-sm leading-6 dark:text-white dark:placeholder:text-gray-500"
              defaultValue=""
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between py-2 pr-2 pl-3">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                disabled={composerDisabled}
                className={cn(
                  '-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500',
                  'dark:text-gray-500 dark:hover:text-white',
                  composerDisabled && 'opacity-60 cursor-not-allowed'
                )}
                aria-label="Attach a file"
              >
                <PaperClipIcon aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                disabled={composerDisabled}
                className={cn(
                  '-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500',
                  'dark:text-gray-500 dark:hover:text-white',
                  composerDisabled && 'opacity-60 cursor-not-allowed'
                )}
                aria-label="Add a mood"
              >
                <FaceSmileIcon aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              disabled={composerDisabled}
              className={cn(
                'rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300',
                'hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:ring-white/10 dark:hover:bg-white/20',
                composerDisabled && 'opacity-60 cursor-not-allowed'
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
