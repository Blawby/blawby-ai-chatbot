import { FunctionComponent, ComponentType } from 'preact';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/shared/ui/Accordion';
import {
  ChatBubbleOvalLeftEllipsisIcon,
  DocumentTextIcon,
  UserIcon,
  CreditCardIcon,
  CheckCircleIcon,
  UserPlusIcon,
  ClockIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  DocumentIcon,
  LinkIcon
} from "@heroicons/react/24/outline";
import { useActivity } from '@/shared/hooks/useActivity';

interface ActivityTimelineProps {
  className?: string;
  practiceId?: string;
  matterId?: string;
  conversationId?: string;
  limit?: number;
}

// Event type to icon mapping - heroicons components are ForwardRefExoticComponent with SVGProps
type IconComponent = ComponentType<{ className?: string }> | ComponentType<Record<string, unknown>>;

const EVENT_ICONS: Record<string, IconComponent> = {
  // Matter Events
  matter_created: ClockIcon,
  matter_status_changed: ChatBubbleOvalLeftEllipsisIcon,
  lawyer_assigned: UserPlusIcon,
  payment_completed: CreditCardIcon,
  payment_failed: CreditCardIcon,

  // Media Events
  image_added: PhotoIcon,
  video_added: VideoCameraIcon,
  audio_added: MusicalNoteIcon,
  document_added: DocumentTextIcon,
  file_added: DocumentIcon,
  link_shared: LinkIcon,

  // Session Events
  session_started: ClockIcon,
  contact_info_provided: UserIcon,
  intake_completed: CheckCircleIcon,
  review_requested: ChatBubbleOvalLeftEllipsisIcon,

  // Default fallback
  default: ClockIcon
};

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

const ActivityTimeline: FunctionComponent<ActivityTimelineProps> = ({ 
  className = '',
  practiceId,
  matterId,
  conversationId,
  limit = 25
}) => {
  // Use the activity hook to fetch real data
  const { events, loading: _loading, error, hasMore, loadMore, refresh } = useActivity({
    practiceId,
    matterId,
    conversationId,
    limit
  });

  return (
    <div className={className}>
      <Accordion type="single" collapsible>
        <AccordionItem value="activity-timeline-section">
          <AccordionTrigger>
            Activity Timeline
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3 pt-2">
              {/* Error state */}
              {error && (
                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex items-center">
                    <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
                  </div>
                  <button
                    onClick={refresh}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Events list */}
              {events.map((event, index) => {
                const IconComponent = EVENT_ICONS[event.eventType] || EVENT_ICONS.default;
                return (
                  <div key={event.id} className="relative flex items-start gap-3">
                    {/* Timeline line */}
                    {index < events.length - 1 && (
                      <div className="absolute left-3 top-8 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
                    )}
                    
                    {/* Icon */}
                    <div className="relative flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <IconComponent className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                          {event.title}
                        </h5>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatRelativeTime(event.eventDate)}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {event.description}
                      </p>
                      {event.actorType && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          by {event.actorType}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Empty state */}
              {!error && events.length === 0 && (
                <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                  <ClockIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Activity will appear here as you use the system</p>
                </div>
              )}

              {/* Load more button */}
              {hasMore && (
                <button
                  onClick={loadMore}
                  className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
                >
                  Load more events
                </button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default ActivityTimeline;
