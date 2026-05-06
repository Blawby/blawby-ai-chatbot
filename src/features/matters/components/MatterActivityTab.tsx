import { useMemo, useState } from 'preact/hooks';
import { Activity, Search, SlidersHorizontal } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { LoadingBlock } from '@/shared/ui/layout';
import { InfoCard } from '@/shared/ui/cards/InfoCard';
import {
  ActivityTimeline,
  type TimelineItem,
  type TimelinePerson
} from '@/shared/ui/activity/ActivityTimeline';

export interface MatterActivityTabProps {
  timelineItems: TimelineItem[];
  activityLoading: boolean;
  activityError: string | null;
  onActivityRetry: () => void;
  onCreateNote: (content: string) => Promise<void>;
  composerPerson: TimelinePerson;
  composerPracticeId: string | null;
  onTaskClick: () => void;
}

export const MatterActivityTab = ({
  timelineItems,
  activityLoading,
  activityError,
  onActivityRetry,
  onCreateNote,
  composerPerson,
  composerPracticeId,
  onTaskClick
}: MatterActivityTabProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return timelineItems;
    return timelineItems.filter((item) => {
      const comment = item.comment ?? '';
      const personName = item.person?.name ?? '';
      return comment.toLowerCase().includes(query) || personName.toLowerCase().includes(query);
    });
  }, [timelineItems, searchQuery]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            icon={Search}
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(value) => setSearchQuery(value)}
          />
        </div>
        <Button size="sm" variant="secondary" icon={SlidersHorizontal}>
          Filters
        </Button>
      </div>

      <InfoCard icon={Activity} title="Activity">
        {activityLoading && timelineItems.length === 0 ? (
          <LoadingBlock label="Loading activity" />
        ) : activityError && timelineItems.length === 0 ? (
          <p className="text-sm text-input-placeholder">
            Could not load activity.{' '}
            <button type="button" className="underline" onClick={onActivityRetry}>
              Retry
            </button>
          </p>
        ) : (
          <ActivityTimeline
            items={filteredItems}
            showComposer
            composerDisabled={activityLoading}
            composerLabel="Comment"
            composerPlaceholder="Add your comment..."
            composerPracticeId={composerPracticeId}
            composerPerson={composerPerson}
            onTaskClick={onTaskClick}
            onComposerSubmit={async (value) => {
              await onCreateNote(value);
            }}
          />
        )}
      </InfoCard>
    </div>
  );
};
